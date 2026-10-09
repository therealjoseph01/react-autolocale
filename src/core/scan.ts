import fs from "node:fs";
import path from "node:path";
import { extractItems } from "./transform.js";

const EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js"]);
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

export function isSourceFile(file: string): boolean {
  return EXTENSIONS.has(path.extname(file)) && !file.endsWith(".d.ts") && !/\.(test|spec)\./.test(file);
}

export function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (isSourceFile(full)) yield full;
  }
}

/** Every translatable string under the configured folders, in stable file order, and where each appears. */
export function scanProjectDetailed(root: string, include: string[]): { strings: string[]; contexts: Record<string, string> } {
  const found = new Set<string>();
  const contexts: Record<string, string> = {};
  for (const dir of include) {
    for (const file of walk(path.resolve(root, dir))) {
      const items = extractItems(fs.readFileSync(file, "utf8"), file);
      for (const s of items.strings) {
        found.add(s);
        contexts[s] ??= items.contexts[s] ?? "";
      }
    }
  }
  return { strings: [...found], contexts };
}

export function scanProject(root: string, include: string[]): string[] {
  return scanProjectDetailed(root, include).strings;
}
