import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { getLanguage } from "../core/languages.js";
import type { Dict } from "../core/cache.js";
import type { SiteConfig } from "../core/site.js";

export interface PrerenderOptions {
  root: string;
  outDir: string;
  site: SiteConfig;
  dicts: Record<string, Dict>;
  log: (msg: string) => void;
}

const MAX_PAGES = 500;

/** Normalizes an internal link like "/fr/about?x=1#y" to "/fr/about/", or returns [] for anything else. */
export function pageLink(href: string, lang: string): string[] {
  let url: URL;
  try {
    url = new URL(href, `http://localhost/${lang}/`);
  } catch {
    return [];
  }
  if (url.origin !== "http://localhost") return [];
  const p = url.pathname.replace(/\/+$/, "");
  if (p !== `/${lang}` && !p.startsWith(`/${lang}/`)) return [];
  if (/\.[a-z0-9]+$/i.test(p)) return []; // files such as .pdf or .png, not pages
  return [p + "/"];
}

/** The module script in the project's index.html, e.g. "/src/main.tsx". */
function findEntry(root: string): string {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (/type=["']module["']/i.test(tag)) {
      const src = /src=["']([^"']+)["']/i.exec(tag)?.[1];
      if (src) return src;
    }
  }
  throw new Error("Could not find <script type=\"module\" src=...> in index.html.");
}

/** Makes the jsdom window the global scope, so browser-only code in the app can run in Node. Returns an undo function. */
function installDom(dom: JSDOM): () => void {
  const win = dom.window as unknown as Record<string, unknown>;
  const keys = new Set(["window", "document", "navigator", "localStorage", "sessionStorage", "location", "history"]);
  for (const k of Object.getOwnPropertyNames(win)) if (!(k in globalThis)) keys.add(k);
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const k of keys) {
    saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    try {
      Object.defineProperty(globalThis, k, { configurable: true, get: () => win[k] });
    } catch {
      /* non-configurable global, leave it */
    }
  }
  return () => {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (globalThis as any)[k];
    }
  };
}

async function waitForRender(dom: JSDOM): Promise<void> {
  const root = dom.window.document.getElementById("root");
  const deadline = Date.now() + 10_000;
  while (root && !root.childElementCount && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 100)); // let effects and lazy state settle
}

/**
 * Renders the app once per language in a DOM and writes static pages: dist/<lang>/index.html
 * (and dist/index.html for the original language). Only #root's content and one inline state script
 * are added; everything else in the page is left as built.
 */
export async function prerender(opts: PrerenderOptions): Promise<void> {
  const { root, outDir, site, dicts, log } = opts;
  const template = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  const entry = findEntry(root);

  const server = await createServer({
    root,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  /** Renders one URL and returns the same-language page links found in it. */
  async function renderPage(lang: string, pathname: string): Promise<string[]> {
    const dict = lang === site.original ? {} : (dicts[lang] ?? {});
    const dom = new JSDOM(template, { url: `http://localhost${pathname}`, pretendToBeVisual: true });
    const win = dom.window as any;
    win.__AUTOSCALE__ = { lang, dict };
    const restore = installDom(dom);
    try {
      server.moduleGraph.invalidateAll();
      await server.ssrLoadModule(entry);
      await waitForRender(dom);
    } finally {
      restore();
    }

    const doc = dom.window.document;
    doc.documentElement.lang = lang;
    doc.documentElement.dir = getLanguage(lang)?.rtl ? "rtl" : "ltr";
    const state = doc.createElement("script");
    state.textContent = `window.__AUTOSCALE__=${JSON.stringify({ lang, dict }).replace(/</g, "\\u003c")}`;
    doc.head.prepend(state);

    const links = [...doc.querySelectorAll("a[href]")].flatMap((a) => pageLink(a.getAttribute("href")!, lang));
    const html = dom.serialize();
    const dir = path.join(outDir, ...pathname.split("/").filter(Boolean));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
    if (pathname === `/${site.original}/`) fs.writeFileSync(path.join(outDir, "index.html"), html);
    log(`[react-autolocale] wrote ${pathname}`);
    dom.window.close();
    return links;
  }

  try {
    for (const lang of [site.original, ...site.languages]) {
      // Follow links from the language's home page so every route becomes a static page.
      const queue = [`/${lang}/`];
      const seen = new Set(queue);
      for (let i = 0; i < queue.length; i++) {
        for (const next of await renderPage(lang, queue[i]!)) {
          if (!seen.has(next) && seen.size < MAX_PAGES) (seen.add(next), queue.push(next));
        }
      }
    }
  } finally {
    await server.close();
  }
}
