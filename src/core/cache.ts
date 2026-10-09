import fs from "node:fs";
import path from "node:path";
import type { SiteConfig } from "./site.js";
import { digitsPreserved, mask, unmask, type Translator } from "./translate.js";

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
  /** Where each string appears ("button", "h1", ...), passed to engines that can use it. */
  contexts?: Record<string, string>;
  /** Terms that must always translate a given way: { fr: { Roadmap: "Feuille de route" } }. */
  glossary?: Record<string, Record<string, string>>;
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

    const terms = opts.glossary?.[lang] ?? {};
    for (const s2 of missing) if (terms[s2]) next[s2] = terms[s2]!; // a whole string that is a glossary term
    const toTranslate = missing.filter((s2) => !terms[s2]);

    if (toTranslate.length) {
      log(`[react-autolocale] ${lang}: translating ${toTranslate.length} new string${toTranslate.length === 1 ? "" : "s"}...`);
      const ctx = toTranslate.map((s2) => opts.contexts?.[s2] ?? "");
      const run = async (items: string[], contextList: string[], numbers: boolean) => {
        const jobs = items.map((s2) => ({ source: s2, ...mask(s2, site.exclude, { glossary: terms, numbers }) }));
        const out = await opts.getTranslator().translate(jobs.map((j) => j.masked), site.original, lang, contextList);
        return jobs.map((job, i) => unmask(out[i] ?? "", job.phrases));
      };
      // Translate naturally first and check that every digit survived. Only strings where a number was changed
      // or dropped are translated again with their numbers locked; if that fails too, the original text is kept
      // rather than shipping a wrong price or phone number.
      const first = await run(toTranslate, ctx, false);
      const redo = toTranslate.map((source, i) => i).filter((i) => !first[i] || !digitsPreserved(toTranslate[i]!, first[i]!));
      const second = redo.length ? await run(redo.map((i) => toTranslate[i]!), redo.map((i) => ctx[i]!), true) : [];
      toTranslate.forEach((source, i) => {
        const result = redo.includes(i) ? second[redo.indexOf(i)] : first[i];
        if (result) next[source] = result;
        else log(`[react-autolocale] ${lang}: kept "${source}" untranslated (could not preserve its numbers or excluded text)`);
      });
    }
    const same = JSON.stringify(existing) === JSON.stringify(next);
    if (!same) fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    result[lang] = next;
  }
  return result;
}
