import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import * as t from "@babel/types";
import type { NodePath } from "@babel/traverse";

// Babel ships CJS-style default exports in some setups; normalise both shapes.
const traverse: typeof _traverse = (_traverse as any).default ?? _traverse;
const generate: typeof _generate = (_generate as any).default ?? _generate;

/** Attributes whose string value is user-visible text. */
const TRANSLATABLE_ATTRS = new Set(["placeholder", "title", "alt", "aria-label", "aria-description"]);
/** Elements whose text content is code, not copy. */
const SKIP_ELEMENTS = new Set(["script", "style", "code", "pre", "kbd", "samp", "svg", "textarea"]);

const T_IMPORT = "__RLT";
const HOOK_IMPORT = "__rlUseT";
const HOOK_VAR = "__rl";
const RUNTIME = "react-autolocale";

export interface TransformResult {
  code: string;
  map: any;
  /** Every source string found in the file. */
  strings: string[];
}

export function parserPlugins(file: string): any[] {
  if (/\.tsx$/.test(file)) return ["typescript", "jsx"];
  if (/\.ts$/.test(file)) return ["typescript"];
  return ["jsx"];
}

/** Collapses JSX text the way React does: lines are trimmed and joined with one space. */
function cleanJsxText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i]!)) last = i;
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.replace(/\t/g, " ");
    if (i !== 0) line = line.replace(/^[ ]+/, "");
    if (i !== lines.length - 1) line = line.replace(/[ ]+$/, "");
    if (line) {
      if (i !== last) line += " ";
      out += line;
    }
  }
  return out;
}

/** Text worth translating: must contain at least one letter in any script. */
function isTranslatable(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * Text next to a `{expression}` is a sentence fragment ("Hello {name}"): translating the
 * pieces separately gives wrong results, so dynamic content is left for v2.
 */
function hasDynamicChild(node: t.JSXElement | t.JSXFragment): boolean {
  return node.children.some((c) => t.isJSXExpressionContainer(c) && !t.isJSXEmptyExpression(c.expression) && !t.isStringLiteral(c.expression));
}

function isComponentName(name: string | undefined): boolean {
  return !!name && /^[A-Z]/.test(name);
}

/** Finds the function that is a React component (PascalCase name, possibly wrapped in memo/forwardRef). */
function enclosingComponent(path: NodePath): NodePath<t.Function> | null {
  let p: NodePath | null = path.parentPath;
  while (p) {
    if (p.isFunction()) {
      const fn = p as NodePath<t.Function>;
      let name: string | undefined;
      if ((fn.node.type === "FunctionDeclaration" || fn.node.type === "FunctionExpression") && fn.node.id) {
        name = fn.node.id.name;
      }
      if (!name) {
        let up: NodePath | null = fn.parentPath;
        // unwrap memo(...) / forwardRef(...)
        while (up && up.isCallExpression()) up = up.parentPath;
        if (up?.isVariableDeclarator() && t.isIdentifier(up.node.id)) name = up.node.id.name;
      }
      if (isComponentName(name)) return fn;
    }
    p = p.parentPath;
  }
  return null;
}

/** Parses a file, extracts translatable strings, and rewrites JSX to render translations. */
export function transformJsx(code: string, file: string, opts: { rewrite?: boolean } = {}): TransformResult | null {
  const rewrite = opts.rewrite !== false;
  if (!code.includes("<")) return null;

  let ast: t.File;
  try {
    ast = parse(code, { sourceType: "module", sourceFilename: file, plugins: parserPlugins(file) });
  } catch {
    return null; // not our job to report syntax errors
  }

  const strings = new Set<string>();
  const hookTargets = new Set<NodePath<t.Function>>();
  let usedT = false;

  traverse(ast, {
    // Children are rebuilt per parent: replacing a text node in place makes Babel skip its next sibling.
    "JSXElement|JSXFragment"(path) {
      const node = path.node as t.JSXElement | t.JSXFragment;
      const name = t.isJSXElement(node) && t.isJSXIdentifier(node.openingElement.name) ? node.openingElement.name.name : null;
      if (name && SKIP_ELEMENTS.has(name)) return;
      if (hasDynamicChild(node)) return;

      const children: t.JSXElement["children"] = [];
      let changed = false;
      for (const child of node.children) {
        const cleaned = t.isJSXText(child) ? cleanJsxText(child.value) : "";
        const text = cleaned.trim();
        if (!t.isJSXText(child) || !text || !isTranslatable(text)) {
          children.push(child);
          continue;
        }
        strings.add(text);
        if (!rewrite) {
          children.push(child);
          continue;
        }
        const space = () => t.jsxExpressionContainer(t.stringLiteral(" "));
        if (/^\s/.test(cleaned)) children.push(space());
        children.push(
          t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier(T_IMPORT), [t.jsxAttribute(t.jsxIdentifier("s"), t.stringLiteral(text))], true),
            null,
            [],
          ),
        );
        if (/\s$/.test(cleaned)) children.push(space());
        usedT = true;
        changed = true;
      }
      if (changed) node.children = children;
    },

    JSXAttribute(path) {
      const { name, value } = path.node;
      if (!t.isJSXIdentifier(name) || !TRANSLATABLE_ATTRS.has(name.name)) return;
      if (!t.isStringLiteral(value)) return;
      // Only plain HTML elements: a component's `title` prop may not be display text.
      const opening = path.parent as t.JSXOpeningElement;
      if (!t.isJSXIdentifier(opening.name) || !/^[a-z]/.test(opening.name.name)) return;
      const text = value.value.trim();
      if (!text || !isTranslatable(text)) return;
      const component = enclosingComponent(path);
      if (!component) return; // no safe place for a hook
      strings.add(text);
      if (!rewrite) return;

      path.node.value = t.jsxExpressionContainer(
        t.callExpression(t.identifier(HOOK_VAR), [t.stringLiteral(text)]),
      );
      hookTargets.add(component);
    },
  });

  if (strings.size === 0) return null;
  if (!rewrite) return { code, map: null, strings: [...strings] };

  // Add `const __rl = __rlUseT();` at the top of each component that translates attributes.
  for (const fn of hookTargets) {
    if (!t.isBlockStatement(fn.node.body)) {
      fn.node.body = t.blockStatement([t.returnStatement(fn.node.body as t.Expression)]);
    }
    (fn.node.body as t.BlockStatement).body.unshift(
      t.variableDeclaration("const", [
        t.variableDeclarator(t.identifier(HOOK_VAR), t.callExpression(t.identifier(HOOK_IMPORT), [])),
      ]),
    );
  }

  const specifiers: t.ImportSpecifier[] = [];
  if (usedT) specifiers.push(t.importSpecifier(t.identifier(T_IMPORT), t.identifier("__T")));
  if (hookTargets.size) specifiers.push(t.importSpecifier(t.identifier(HOOK_IMPORT), t.identifier("__useT")));
  ast.program.body.unshift(t.importDeclaration(specifiers, t.stringLiteral(RUNTIME)));

  const out = generate(ast, { sourceMaps: true, sourceFileName: file }, code);
  return { code: out.code, map: out.map, strings: [...strings] };
}

/** Strings only, without rewriting (used by `react-autolocale sync`). */
export function extractStrings(code: string, file: string): string[] {
  return transformJsx(code, file, { rewrite: false })?.strings ?? [];
}
