import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { parserPlugins } from "./transform.js";
import { walk } from "./scan.js";

const traverse: typeof _traverse = (_traverse as any).default ?? _traverse;

export interface SiteConfig {
  /** Language the source code is written in. */
  original: string;
  /** Languages to generate (not including `original`). */
  languages: string[];
  /** Phrases that are never translated (brand and product names). */
  exclude: string[];
}

function literal(node: t.Node | null | undefined): string | string[] | undefined {
  if (!node) return undefined;
  if (t.isJSXExpressionContainer(node)) return literal(node.expression);
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) return node.quasis[0]!.value.cooked ?? undefined;
  if (t.isArrayExpression(node)) {
    const items = node.elements.map((e) => literal(e));
    return items.every((i) => typeof i === "string") ? (items as string[]) : undefined;
  }
  return undefined;
}

/** Reads the literal props of `<AutoScale ...>` from source code. Returns null if the file has none. */
export function parseAutoScale(code: string, file: string): SiteConfig | null {
  if (!code.includes("AutoScale")) return null;
  let ast: t.File;
  try {
    ast = parse(code, { sourceType: "module", plugins: parserPlugins(file) });
  } catch {
    return null;
  }
  let found: SiteConfig | null = null;
  traverse(ast, {
    JSXOpeningElement(path) {
      const name = path.node.name;
      if (found || !t.isJSXIdentifier(name) || name.name !== "AutoScale") return;
      const props: Record<string, string | string[] | undefined> = {};
      for (const attr of path.node.attributes) {
        if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) props[attr.name.name] = literal(attr.value);
      }
      const { original, languages, exclude } = props;
      if (typeof original !== "string" || !Array.isArray(languages)) {
        throw new Error(
          `${file}: <AutoScale> needs literal props, e.g. original="en" languages={["fr", "es"]}. ` +
            `Values must be written inline (not variables) so they can be read at build time.`,
        );
      }
      found = {
        original,
        languages: languages.filter((l) => l !== original),
        exclude: Array.isArray(exclude) ? exclude : [],
      };
    },
  });
  return found;
}

/** Finds the first <AutoScale> in the project's source folders. */
export function findSite(root: string, include: string[]): SiteConfig {
  for (const dir of include) {
    for (const file of walk(path.resolve(root, dir))) {
      const site = parseAutoScale(fs.readFileSync(file, "utf8"), file);
      if (site) return site;
    }
  }
  throw new Error(
    `No <AutoScale> found in ${include.join(", ")}. Wrap your app: ` +
      `<AutoScale original="en" languages={["fr", "es"]}><App /></AutoScale>`,
  );
}

/** Folders scanned for JSX. */
export function defaultInclude(root: string): string[] {
  return fs.existsSync(path.join(root, "src")) ? ["src"] : ["."];
}
