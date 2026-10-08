import fs from "node:fs";
import path from "node:path";
import type { SiteConfig } from "./site.js";
import { mask, unmask, type Translator } from "./translate.js";

export type Dict = Record<string, string>;

/** Generated translations live here, outside the source tree. */
export function cacheDir(root: string): string {
  return path.join(root, "node_modules", ".cache", "react-autolocale");
}

export function cacheFile(root: string, lang: string): string {
  return path.join(cacheDir(root), `${lang}.json`);
}

function readDict(file: string): Dict {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Dict;
  } catch {
    return {};
  }
}

/** Strings that are entirely an excluded phrase need no translation. */
function needsTranslation(s: string, exclude: string[]): boolean {
  return !exclude.includes(s.trim());
}

export interface EnsureOptions {
  root: string;
  site: SiteConfig;
  strings: string[];
  /** Hand-written fixes: { fr: { "Contact": "Contact" } }. They always win over machine translation. */
  overrides?: Record<string, Record<string, string>>;
  /** Created lazily, only if something needs translating. */
  getTranslator: () => Translator;
  log?: (msg: string) => void;
}

/** Translates only strings missing from the cache, drops unused ones, and returns every language's dictionary. */
export async function ensureTranslations(opts: EnsureOptions): Promise<Record<string, Dict>> {
  const { root, site, strings } = opts;
  const log = opts.log ?? (() => {});
  const wanted = strings.filter((s) => needsTranslation(s, site.exclude));
  const result: Record<string, Dict> = {};
  fs.mkdirSync(cacheDir(root), { recursive: true });

  for (const lang of site.languages) {
    const file = cacheFile(root, lang);
    const existing = readDict(file);
    const fixed = opts.overrides?.[lang] ?? {};
    const missing = wanted.filter((s) => !existing[s] && !fixed[s]);
    const next: Dict = {};
    for (const s of wanted) if (existing[s]) next[s] = existing[s]!;
    for (const s of wanted) if (fixed[s]) next[s] = fixed[s]!;

    if (missing.length) {
      log(`[react-autolocale] ${lang}: translating ${missing.length} new string${missing.length === 1 ? "" : "s"}...`);
      const jobs = missing.map((s) => ({ source: s, ...mask(s, site.exclude) }));
      const out = await opts.getTranslator().translate(jobs.map((j) => j.masked), site.original, lang);
      jobs.forEach((job, i) => {
        const restored = unmask(out[i] ?? "", job.phrases);
        if (restored) next[job.source] = restored;
        else log(`[react-autolocale] ${lang}: kept "${job.source}" untranslated (could not preserve excluded text)`);
      });
    }
    const same = JSON.stringify(existing) === JSON.stringify(next);
    if (!same) fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    result[lang] = next;
  }
  return result;
}
