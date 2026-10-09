import { JSDOM } from "jsdom";
import type { Dict } from "./cache.js";

const META_SELECTORS = [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
];

/** Title and description-like tags worth translating (only used when seo is on). */
export function headStrings(html: string): string[] {
  const doc = new JSDOM(html).window.document;
  const out = new Set<string>();
  const title = doc.title.trim();
  if (title && /\p{L}/u.test(title)) out.add(title);
  for (const sel of META_SELECTORS) {
    const v = doc.querySelector(sel)?.getAttribute("content")?.trim();
    if (v && /\p{L}/u.test(v)) out.add(v);
  }
  return [...out];
}

export function translateHead(doc: Document, dict: Dict): void {
  const title = doc.title.trim();
  if (title && dict[title]) doc.title = dict[title]!;
  for (const sel of META_SELECTORS) {
    const el = doc.querySelector(sel);
    const v = el?.getAttribute("content")?.trim();
    if (el && v && dict[v]) el.setAttribute("content", dict[v]!);
  }
}
