import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { NodePath } from "@babel/traverse";
import { walk } from "./scan.js";
import { parserPlugins } from "./transform.js";

const traverse: typeof _traverse = (_traverse as any).default ?? _traverse;

function str(node: t.Node | null | undefined): string | null {
  if (t.isJSXExpressionContainer(node)) return str(node.expression);
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) return node.quasis[0]!.value.cooked ?? null;
  return null;
}

/** "/a" + "b" -> "/a/b"; an absolute child replaces the parent. */
function join(parent: string, child: string): string {
  if (child.startsWith("/")) return child;
  return (parent.replace(/\/+$/, "") + "/" + child).replace(/\/+/g, "/");
}

/** Only fixed paths can become static pages: no :params, wildcards or optional segments. */
function isStatic(p: string): boolean {
  return p.startsWith("/") && !/[:*?()]/.test(p);
}

function jsxRoutePath(el: t.JSXOpeningElement): string | null {
  if (!t.isJSXIdentifier(el.name) || el.name.name !== "Route") return null;
  for (const a of el.attributes) {
    if (t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "path" })) return str(a.value);
  }
  return null;
}

const PAGE_PROPS = new Set(["element", "Component", "lazy", "index"]);

/** A <Route> that only groups children (no element, Component, lazy or index) is not a page itself. */
function jsxIsPage(el: t.JSXOpeningElement, hasChildren: boolean): boolean {
  if (!hasChildren) return true;
  return el.attributes.some((a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && PAGE_PROPS.has(a.name.name));
}

function objectIsPage(obj: t.ObjectExpression): boolean {
  const hasChildren = obj.properties.some((p) => t.isObjectProperty(p) && t.isIdentifier(p.key, { name: "children" }));
  if (!hasChildren) return true;
  return obj.properties.some((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && PAGE_PROPS.has(p.key.name));
}

function objectPath(obj: t.ObjectExpression): string | null {
  for (const p of obj.properties) {
    if (t.isObjectProperty(p) && (t.isIdentifier(p.key, { name: "path" }) || t.isStringLiteral(p.key, { value: "path" }))) {
      return str(p.value);
    }
  }
  return null;
}

/** Static route paths defined in one file (React Router <Route path> and route objects with `path`). */
export function routesInCode(code: string, file: string): string[] {
  if (!code.includes("path")) return [];
  let ast: t.File;
  try {
    ast = parse(code, { sourceType: "module", plugins: parserPlugins(file) });
  } catch {
    return [];
  }
  const found = new Set<string>();
  const add = (p: string) => isStatic(p) && found.add(p);

  traverse(ast, {
    JSXOpeningElement(p: NodePath<t.JSXOpeningElement>) {
      const own = jsxRoutePath(p.node);
      if (own === null) return;
      // Walk up through parent <Route> elements to build the full path.
      const chain: string[] = [own];
      for (let up = p.parentPath.parentPath as NodePath<any> | null; up; up = up.parentPath as NodePath<any> | null) {
        if (up.isJSXElement()) {
          const parentPath = jsxRoutePath(up.node.openingElement);
          if (parentPath !== null) chain.unshift(parentPath);
        }
      }
      const el = p.parent as t.JSXElement;
      if (jsxIsPage(p.node, !!el.children?.some((c) => t.isJSXElement(c)))) add(chain.reduce((acc, seg) => join(acc, seg), "/"));
    },
    ObjectExpression(p: NodePath<t.ObjectExpression>) {
      const own = objectPath(p.node);
      if (own === null) return;
      const chain: string[] = [own];
      // route objects nest through a `children: [ ... ]` property
      for (let up = p.parentPath as NodePath<any> | null; up; up = up.parentPath as NodePath<any> | null) {
        if (up.isObjectProperty() && t.isIdentifier(up.node.key, { name: "children" })) {
          const parentObj = up.parentPath;
          if (parentObj?.isObjectExpression()) {
            const parentPath = objectPath(parentObj.node);
            if (parentPath !== null) chain.unshift(parentPath);
          }
        }
      }
      if (objectIsPage(p.node)) add(chain.reduce((acc, seg) => join(acc, seg), "/"));
    },
  });
  return [...found];
}

/** Every static route found in the project's source folders. */
export function discoverRoutes(root: string, include: string[]): string[] {
  const all = new Set<string>();
  for (const dir of include) {
    for (const file of walk(path.resolve(root, dir))) {
      for (const r of routesInCode(fs.readFileSync(file, "utf8"), file)) all.add(r);
    }
  }
  return [...all];
}
