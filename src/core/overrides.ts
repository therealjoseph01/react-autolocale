import fs from "node:fs";
import path from "node:path";
import { cacheDir } from "./cache.js";

export type Overrides = Record<string, Record<string, string>>;

/** A committed file the developer edits to correct translations. It always wins over machine translation. */
export const OVERRIDES_FILE = "react-autolocale.overrides.json";

export function readOverrides(root: string): Overrides {
  const file = path.join(root, OVERRIDES_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Overrides;
  } catch (err) {
    throw new Error(`${OVERRIDES_FILE} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Later arguments win. */
export function mergeOverrides(...all: (Overrides | undefined)[]): Overrides {
  const out: Overrides = {};
  for (const o of all) {
    for (const [lang, strings] of Object.entries(o ?? {})) out[lang] = { ...out[lang], ...strings };
  }
  return out;
}

/** Writes every generated translation into the overrides file (keeping entries already there) so it can be edited. */
export function exportTranslations(root: string): { file: string; languages: Record<string, number> } {
  const dir = cacheDir(root);
  if (!fs.existsSync(dir)) throw new Error("No generated translations found. Run your build first.");
  const generated: Overrides = {};
  for (const name of fs.readdirSync(dir)) {
    const m = /^([a-z]{2,3})\.json$/i.exec(name);
    if (m) generated[m[1]!.toLowerCase()] = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  }
  if (!Object.keys(generated).length) throw new Error("No generated translations found. Run your build first.");

  const merged = mergeOverrides(generated, readOverrides(root)); // what is already in the file stays
  const file = path.join(root, OVERRIDES_FILE);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  return { file, languages: Object.fromEntries(Object.entries(merged).map(([l, s]) => [l, Object.keys(s).length])) };
}
