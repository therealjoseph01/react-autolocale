import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import type { Dict } from "../core/cache.js";
import { translateHead } from "../core/head.js";
import type { SiteConfig } from "../core/site.js";

export interface RenderedPage {
  lang: string;
  /** "/fr/about/" */
  pathname: string;
  file: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const restOf = (p: RenderedPage) => p.pathname.slice(p.lang.length + 1) || "/";

export function buildSitemap(base: string, pages: Pick<RenderedPage, "lang" | "pathname">[]): string {
  const byRest = new Map<string, string[]>();
  for (const p of pages) {
    const rest = restOf(p as RenderedPage);
    byRest.set(rest, [...(byRest.get(rest) ?? []), p.lang]);
  }
  const urls = pages.map((p) => {
    const rest = restOf(p as RenderedPage);
    const alts = byRest
      .get(rest)!
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(base + "/" + l + rest)}"/>`)
      .join("\n");
    return `  <url>\n    <loc>${esc(base + p.pathname)}</loc>\n${alts}\n  </url>`;
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
}

/**
 * seo mode: translated title/meta, canonical, hreflang alternates and a sitemap.
 * Only runs when <AutoScale seo> is set; without it these files are never touched.
 */
export function applySeo(opts: {
  outDir: string;
  site: SiteConfig;
  dicts: Record<string, Dict>;
  pages: RenderedPage[];
  log: (msg: string) => void;
}): void {
  const { outDir, site, dicts, pages, log } = opts;
  const base = (site.siteUrl ?? "").replace(/\/+$/, "");
  if (!base) log("[react-autolocale] seo: no siteUrl set, so hreflang and canonical use relative URLs and no sitemap is written. Add siteUrl=\"https://your-site.com\" to <AutoScale>.");

  const langsByRest = new Map<string, string[]>();
  for (const p of pages) langsByRest.set(restOf(p), [...(langsByRest.get(restOf(p)) ?? []), p.lang]);

  for (const page of pages) {
    const rest = restOf(page);
    const doc = new JSDOM(fs.readFileSync(page.file, "utf8")).window.document;
    if (page.lang !== site.original) translateHead(doc, dicts[page.lang] ?? {});

    doc.querySelectorAll('link[rel="canonical"]').forEach((n) => n.remove());
    const add = (attrs: Record<string, string>) => {
      const link = doc.createElement("link");
      for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v);
      doc.head.append(link);
    };
    add({ rel: "canonical", href: `${base}/${page.lang}${rest}` });
    const langs = langsByRest.get(rest)!;
    for (const l of langs) add({ rel: "alternate", hreflang: l, href: `${base}/${l}${rest}` });
    add({ rel: "alternate", hreflang: "x-default", href: `${base}/${langs.includes(site.original) ? site.original : langs[0]}${rest}` });
    fs.writeFileSync(page.file, "<!DOCTYPE html>" + doc.documentElement.outerHTML);
  }

  if (base) {
    const sitemapPages = pages.filter((p) => p.pathname.startsWith(`/${p.lang}/`) && p.file !== path.join(outDir, "index.html"));
    fs.writeFileSync(path.join(outDir, "sitemap.xml"), buildSitemap(base, sitemapPages));
    log("[react-autolocale] seo: wrote sitemap.xml (reference it from robots.txt)");
  }
}
