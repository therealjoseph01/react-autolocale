import { describe, expect, it } from "vitest";
import { parseAutoScale } from "../src/core/site.js";
import { mask, unmask } from "../src/core/translate.js";

describe("parseAutoScale", () => {
  it("reads literal props", () => {
    const code = `export const R = () => (
      <AutoScale original="en" languages={["fr", "es", "en"]} exclude={["Acme", "Acme Pro"]}><App /></AutoScale>
    );`;
    expect(parseAutoScale(code, "main.tsx")).toEqual({
      original: "en",
      languages: ["fr", "es"],
      exclude: ["Acme", "Acme Pro"],
    });
  });

  it("returns null without AutoScale and throws on non-literal props", () => {
    expect(parseAutoScale(`const A = () => <div />;`, "a.tsx")).toBeNull();
    expect(() => parseAutoScale(`const A = () => <AutoScale original={x} languages={y}><App/></AutoScale>;`, "a.tsx")).toThrow(/literal/);
  });
});

describe("exclude masking", () => {
  it("protects longest phrase first and restores it", () => {
    const { masked, phrases } = mask("Welcome to Acme Pro, by Acme", ["Acme", "Acme Pro"]);
    expect(phrases).toEqual(["Acme Pro", "Acme"]);
    expect(masked).toBe("Welcome to X0X, by X1X");
    expect(unmask("Bienvenue sur X0X, par X1X", phrases)).toBe("Bienvenue sur Acme Pro, par Acme");
  });

  it("rejects output where the model dropped a placeholder", () => {
    expect(unmask("Bienvenue", ["Acme"])).toBeNull();
  });
});

import { pageLink } from "../src/vite/prerender.js";

describe("pageLink", () => {
  it("keeps same-language internal pages, normalized", () => {
    expect(pageLink("/fr/about", "fr")).toEqual(["/fr/about/"]);
    expect(pageLink("/fr", "fr")).toEqual(["/fr/"]);
    expect(pageLink("contact?x=1#top", "fr")).toEqual(["/fr/contact/"]);
  });
  it("ignores other languages, external links, and files", () => {
    expect(pageLink("/es/about", "fr")).toEqual([]);
    expect(pageLink("https://example.com/fr/a", "fr")).toEqual([]);
    expect(pageLink("/fr/menu.pdf", "fr")).toEqual([]);
    expect(pageLink("mailto:a@b.co", "fr")).toEqual([]);
  });
});
