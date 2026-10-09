import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { redirectScript, redirectTarget } from "../src/core/redirect.js";
import { parseAutoScale } from "../src/core/site.js";
import { headStrings, translateHead } from "../src/core/head.js";
import { buildSitemap } from "../src/vite/seo.js";

const codes = ["en", "fr", "es"];
const base = { codes, original: "en", pathname: "/", browser: ["en-US"] as string[] };

describe("redirectTarget", () => {
  it("sends a visitor on / to their browser language", () => {
    expect(redirectTarget({ ...base, browser: ["fr-CA", "en"] })).toBe("/fr/");
    expect(redirectTarget({ ...base, browser: ["de", "es"], pathname: "/about", search: "?a=1" })).toBe("/es/about?a=1");
  });

  it("stays put for the original language, unsupported languages, and explicit language URLs", () => {
    expect(redirectTarget(base)).toBeNull();
    expect(redirectTarget({ ...base, browser: ["ja"] })).toBeNull();
    expect(redirectTarget({ ...base, browser: ["fr"], pathname: "/en/about" })).toBeNull();
    expect(redirectTarget({ ...base, browser: ["en"], pathname: "/fr/" })).toBeNull();
  });

  it("a saved choice beats the browser language, including choosing the original", () => {
    expect(redirectTarget({ ...base, browser: ["fr"], saved: "es" })).toBe("/es/");
    expect(redirectTarget({ ...base, browser: ["fr"], saved: "en" })).toBeNull();
  });
});

describe("redirectScript", () => {
  const run = (pathname: string, languages: string[], saved?: string) => {
    let to: string | null = null;
    let rewritten: string | null = null;
    new Function("location", "navigator", "localStorage", "history", redirectScript(codes, "en"))(
      { pathname, search: "", hash: "", replace: (u: string) => (to = u) },
      { languages },
      { getItem: () => saved ?? null },
      { state: null, replaceState: (_s: unknown, _t: string, u: string) => (rewritten = u) },
    );
    return { to, rewritten };
  };
  it("matches the function's behaviour", () => {
    expect(run("/", ["fr-FR"]).to).toBe("/fr/");
    expect(run("/about", ["es"]).to).toBe("/es/about");
    expect(run("/", ["en-US"]).to).toBeNull();
    expect(run("/fr/", ["es"]).to).toBeNull();
    expect(run("/", ["fr"], "en").to).toBeNull();
  });
  it("settles on the original language's prefixed URL when the visitor stays", () => {
    expect(run("/", ["en-US"]).rewritten).toBe("/en/");
    expect(run("/about", ["ja"]).rewritten).toBe("/en/about");
    expect(run("/fr/about", ["en"]).rewritten).toBeNull(); // already prefixed: untouched
    expect(run("/", ["fr"]).rewritten).toBeNull(); // redirecting instead
  });
});

describe("seo props", () => {
  const parse = (attrs: string) => parseAutoScale(`const R = () => <AutoScale original="en" languages={["fr"]} ${attrs}><App /></AutoScale>;`, "m.tsx")!;
  it("is off unless set", () => {
    expect(parse("").seo).toBe(false);
    expect(parse("seo={false}").seo).toBe(false);
  });
  it("accepts seo, seo={true} and seo=\"true\", plus siteUrl", () => {
    expect(parse("seo").seo).toBe(true);
    expect(parse("seo={true}").seo).toBe(true);
    const s = parse('seo="true" siteUrl="https://acme.com"');
    expect(s.seo).toBe(true);
    expect(s.siteUrl).toBe("https://acme.com");
  });
});

describe("head and sitemap", () => {
  const html = `<html><head><title>Acme Cloud</title><meta name="description" content="Fast hosting"><meta property="og:title" content="Acme Cloud"></head><body></body></html>`;
  it("finds and translates title and meta tags", () => {
    expect(headStrings(html)).toEqual(["Acme Cloud", "Fast hosting"]);
    const doc = new JSDOM(html).window.document;
    translateHead(doc, { "Acme Cloud": "Acme Nuage", "Fast hosting": "Hébergement rapide" });
    expect(doc.title).toBe("Acme Nuage");
    expect(doc.querySelector('meta[name="description"]')!.getAttribute("content")).toBe("Hébergement rapide");
    expect(doc.querySelector('meta[property="og:title"]')!.getAttribute("content")).toBe("Acme Nuage");
  });

  it("builds a sitemap with hreflang alternates", () => {
    const xml = buildSitemap("https://acme.com", [
      { lang: "en", pathname: "/en/about/" },
      { lang: "fr", pathname: "/fr/about/" },
    ]);
    expect(xml).toContain("<loc>https://acme.com/fr/about/</loc>");
    expect(xml).toContain('hreflang="en" href="https://acme.com/en/about/"');
    expect(xml).toContain('hreflang="fr" href="https://acme.com/fr/about/"');
  });
});
