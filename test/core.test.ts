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
      seo: false,
      siteUrl: undefined,
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

import { routesInCode } from "../src/core/routes.js";
import { routePath } from "../src/vite/prerender.js";

describe("routesInCode", () => {
  it("reads fixed JSX routes, joins nested ones, skips params and wildcards", () => {
    const code = `const R = () => (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/thank-you" element={<T />} />
        <Route path="/account" element={<Layout />}>
          <Route path="billing" element={<B />} />
          <Route path="/abs" element={<A />} />
          <Route index element={<I />} />
        </Route>
        <Route path="/users/:id" element={<U />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );`;
    expect(routesInCode(code, "R.tsx").sort()).toEqual(["/", "/abs", "/account", "/account/billing", "/thank-you"]);
  });

  it("reads route objects with children", () => {
    const code = `const router = createBrowserRouter([
      { path: "/", element: <Home /> },
      { path: "/shop", children: [{ path: "cart" }, { path: ":id" }] },
    ]);`;
    expect(routesInCode(code, "r.tsx").sort()).toEqual(["/", "/shop/cart"]);
  });
});

describe("routePath", () => {
  it("normalizes user-supplied routes", () => {
    expect(routePath("thank-you")).toBe("/thank-you/");
    expect(routePath("/users/1/")).toBe("/users/1/");
    expect(routePath("/")).toBe("/");
    expect(routePath("/files/a.pdf")).toBeNull();
  });
});
