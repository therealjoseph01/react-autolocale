import fs from "node:fs";
import path from "node:path";
import { cacheDir } from "./cache.js";
import { BANNER_EN, type BannerText } from "./suggestion.js";
import { mask, unmask, type Translator } from "./translate.js";

const FILE = (root: string) => path.join(cacheDir(root), "_banner.json");

/** The banner's fixed phrases in every language, so a visitor sees them in their own language. */
export async function ensureBanner(opts: {
  root: string;
  langs: string[];
  getTranslator: () => Translator;
  log?: (msg: string) => void;
}): Promise<Record<string, BannerText>> {
  // The cache is tied to the English source phrases, so rewording them re-translates everything.
  const source = JSON.stringify(BANNER_EN);
  let cached: Record<string, BannerText> = {};
  try {
    const file = JSON.parse(fs.readFileSync(FILE(opts.root), "utf8"));
    if (file._source === source) cached = file;
  } catch {
    /* first run */
  }
  const out: Record<string, BannerText> = { en: BANNER_EN };
  let changed = false;
  const keys = Object.keys(BANNER_EN) as (keyof BannerText)[];

  for (const lang of opts.langs) {
    if (lang === "en") continue;
    if (cached[lang]) {
      out[lang] = cached[lang]!;
      continue;
    }
    opts.log?.(`[react-autolocale] ${lang}: translating banner text...`);
    const jobs = keys.map((k) => mask(BANNER_EN[k], ["{language}"]));
    const translated = await opts.getTranslator().translate(jobs.map((j) => j.masked), "en", lang);
    const text = { ...BANNER_EN };
    keys.forEach((k, i) => {
      text[k] = unmask(translated[i] ?? "", jobs[i]!.phrases) ?? BANNER_EN[k];
    });
    out[lang] = text;
    cached[lang] = text;
    changed = true;
  }
  if (changed) {
    fs.mkdirSync(cacheDir(opts.root), { recursive: true });
    fs.writeFileSync(FILE(opts.root), JSON.stringify({ _source: source, ...cached }, null, 2) + "\n");
  }
  return out;
}
