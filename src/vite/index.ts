import fs from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { cacheFile, ensureTranslations, type Dict } from "../core/cache.js";
import { getLanguage } from "../core/languages.js";
import { scanProject, isSourceFile } from "../core/scan.js";
import { headStrings } from "../core/head.js";
import { discoverRoutes } from "../core/routes.js";
import { defaultInclude, findSite, type SiteConfig } from "../core/site.js";
import { createLocalTranslator, type Translator } from "../core/translate.js";
import { transformJsx } from "../core/transform.js";
import { prerender } from "./prerender.js";

const VIRTUAL_ID = "virtual:react-autolocale";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

export interface ReactAutolocaleOptions {
  /** Folders (relative to the project root) scanned for JSX. Defaults to "src". */
  include?: string[];
  /** Fix individual translations by hand, e.g. { fr: { Contact: "Contact" } }. */
  overrides?: Record<string, Record<string, string>>;
  /**
   * Extra pages to build, mainly dynamic ones such as "/users/1" (a function can fetch them). Pages reached
   * by links and fixed routes written in your router (<Route path="/thank-you">) are found automatically.
   */
  routes?: string[] | (() => string[] | Promise<string[]>);
}

export default function reactAutolocale(options: ReactAutolocaleOptions = {}): Plugin {
  let config: ResolvedConfig;
  let root = process.cwd();
  let include: string[] = [];
  let includeDirs: string[] = [];
  let site: SiteConfig;
  let dicts: Record<string, Dict> = {};
  let translator: Translator | undefined;
  let server: ViteDevServer | undefined;
  let rendered = false;

  const log = (msg: string) => console.log(msg);
  const getTranslator = () => (translator ??= createLocalTranslator(log));

  async function refresh(): Promise<void> {
    include = options.include ?? defaultInclude(root);
    includeDirs = include.map((d) => path.resolve(root, d) + path.sep);
    site = findSite(root, include);
    const strings = scanProject(root, include);
    if (site.seo) {
      const html = path.join(root, "index.html");
      if (fs.existsSync(html)) strings.push(...headStrings(fs.readFileSync(html, "utf8")));
    }
    dicts = await ensureTranslations({ root, site, strings, getTranslator, log, overrides: options.overrides });
  }

  function virtualModule(): string {
    const meta = site.languages.map((code) => ({
      code,
      native: getLanguage(code)?.native ?? code,
      rtl: !!getLanguage(code)?.rtl,
    }));
    const loaders = site.languages
      .filter((code) => fs.existsSync(cacheFile(root, code)))
      .map((code) => `${JSON.stringify(code)}: () => import(${JSON.stringify(cacheFile(root, code))})`);
    return [
      `export const original = ${JSON.stringify(site.original)};`,
      `export const originalNative = ${JSON.stringify(getLanguage(site.original)?.native ?? site.original)};`,
      `export const seo = ${JSON.stringify(site.seo)};`,
      `export const languages = ${JSON.stringify(meta)};`,
      `export const loaders = { ${loaders.join(", ")} };`,
    ].join("\n");
  }

  // Dev server: text added while running is translated shortly after, then the page reloads.
  let timer: NodeJS.Timeout | undefined;
  let busy = false;
  function scheduleRefresh(): void {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (busy || !server) return;
      busy = true;
      try {
        await refresh();
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      } catch (err) {
        log(`[react-autolocale] ${(err as Error).message}`);
      } finally {
        busy = false;
      }
    }, 400);
  }

  return {
    name: "react-autolocale",
    enforce: "pre",

    config() {
      // Serve the runtime as source so it can import the virtual module; SSR and Vitest must bundle it too.
      return {
        optimizeDeps: { exclude: ["react-autolocale"] },
        ssr: { noExternal: ["react-autolocale"] },
        test: { server: { deps: { inline: ["react-autolocale"] } } },
      } as Record<string, unknown>;
    },

    configResolved(resolved) {
      config = resolved;
      root = resolved.root;
    },

    configureServer(s) {
      server = s;
    },

    async buildStart() {
      if (config.build.ssr) return;
      await refresh();
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },

    load(id) {
      return id === RESOLVED_ID ? virtualModule() : null;
    },

    transform(code, id) {
      const file = id.split("?")[0]!;
      if (file.startsWith("\0") || file.includes("node_modules") || !isSourceFile(file)) return null;
      if (!includeDirs.some((d) => file.startsWith(d))) return null;
      const result = transformJsx(code, file);
      if (!result) return null;
      if (config.command === "serve" && site) {
        const known = site.languages.every((l) => result.strings.every((s) => site.exclude.includes(s.trim()) || dicts[l]?.[s]));
        if (!known) scheduleRefresh();
      }
      return { code: result.code, map: result.map };
    },

    closeBundle: {
      order: "post",
      async handler() {
        if (config.command !== "build" || config.build.ssr || rendered) return;
        rendered = true;
        const extra = typeof options.routes === "function" ? await options.routes() : (options.routes ?? []);
        // Routes defined in the code are found automatically; `routes` adds dynamic ones such as "/users/1".
        const routes = [...new Set([...discoverRoutes(root, include), ...extra])];
        await prerender({ root, outDir: path.resolve(root, config.build.outDir), site, include, routes, dicts, log });
      },
    },
  };
}

export { reactAutolocale };
