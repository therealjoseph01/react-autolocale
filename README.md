# react-autolocale

Wrap your React + Vite app in one component. `vite build` produces a fully translated static page for every language (`/en/`, `/fr/`, `/es/`, ...) using a free local translation model. No `t()`, no keys, no translation files in your repo, and your source code stays untouched.

## Quick start

**1. Install** (npm, yarn or pnpm)

```bash
npm install react-autolocale     # or: yarn add react-autolocale   |   pnpm add react-autolocale
```

**2. Add the plugin to your Vite config**

```bash
npx react-autolocale init        # or: yarn react-autolocale init   |   pnpm exec react-autolocale init
```

**3. Wrap your app once**

```tsx
// main.tsx
import { AutoScale } from "react-autolocale";

createRoot(document.getElementById("root")!).render(
  <AutoScale original="en" languages={["fr", "es", "de", "pt"]} exclude={["Acme Cloud"]}>
    <App />
  </AutoScale>,
);
```

**4. Build**

```bash
npm run build                    # or: yarn build   |   pnpm build
npm run preview                  # optional: check the built site locally
```

The output folder has one page per language and route (`dist/fr/`, `dist/fr/about/`, ...), deployable anywhere that serves static files. The first build takes a few minutes: it installs the free local translation engine (about 440 MB, once, into `~/.cache/react-autolocale/engine`, shared by all your projects) and downloads the models. Later builds reuse the cache. Prefer to manage the engine yourself? `npm install -D @huggingface/transformers` and it will be used instead.

Optional: `npx react-autolocale add switcher` copies an editable language switcher into your project (see below).

Write normal JSX; there is no `t()` to call and no translation file to maintain.

## Multi-page apps (React Router)

Every page is generated, with nothing to configure. The build finds pages two ways: by following the links in each page, and by reading the fixed routes in your router code (`<Route path="/thank-you">`, nested routes, and `createBrowserRouter` objects). Pages written as `/fr/about/index.html` etc. are created for each language.

Dynamic routes (`/users/:id`) can't be known from code, so list the real pages you want with the `routes` option, which can also be a function that fetches them:

```ts
reactAutolocale({ routes: async () => (await getUsers()).map((u) => `/users/${u.id}`) })
```

Give your router the language as its basename, and remount it when the language changes:

```tsx
function Shell() {
  const { basePath, language } = useLanguage();
  return (
    <BrowserRouter basename={basePath} key={language}>
      <Routes>...</Routes>
    </BrowserRouter>
  );
}

<AutoScale original="en" languages={["fr", "es"]}><Shell /></AutoScale>
```

Your host must serve `/fr/about/index.html` for `/fr/about`, which static hosts do by default.

## Fixing a translation

The quickest way is the overrides file. Run `npx react-autolocale export` after a build: it writes every generated translation into `react-autolocale.overrides.json` in your project root. Edit any value, commit the file and rebuild. Entries in it always win over machine translation and survive rebuilds (edits made inside `dist/` or the cache do not).

You can also fix a few strings in code:

Machine translation sometimes gets short UI words wrong (a nav link "Home" may come back as "Sommaire"). Correct any string in the plugin options; overrides always win:

```ts
reactAutolocale({ overrides: { fr: { Home: "Accueil" }, es: { Home: "Inicio" } } })
```

## Different values per language (prices, links, and more)

Some things should differ by language, not just be translated: a price, a link to a localized page, a phone number.

```tsx
import { useLocalized, Localized, ForLanguages, useFormat } from "react-autolocale";

// A value: falls back to `default`, then to the original language
const href = useLocalized({ en: "/pricing", fr: "/tarifs", es: "/precios", default: "/pricing" });
<a href={href}>Pricing</a>                        // "Pricing" itself is still translated for you

// A block of UI
<Localized en={<UsPhone />} fr={<FrPhone />} default={<UsPhone />} />

// Content for some languages only (local offers, legal notices)
<ForLanguages only={["fr", "es"]}>Free shipping in Europe</ForLanguages>
<ForLanguages except={["ja"]}><CookieNotice /></ForLanguages>

// Numbers, prices and dates in the visitor's format
const format = useFormat();
format.currency(1234.5, "EUR");   // "€1,234.50" in English, "1 234,50 €" in French
format.number(1250000);           // "1,250,000" / "1 250 000"
format.percent(0.15);             // "15%" / "15 %"
format.date(new Date());          // "Oct 9, 2026" / "9 oct. 2026"
```

All of these are part of the prerendered pages, so `/fr/` and `/en/` ship with their own values in the HTML. Values you pick in code are your own data and are never machine-translated. `basePath` from `useLanguage()` is the current prefix (`/fr`) for building internal links. With React Router, the page you link to must be a route you define (here `/tarifs`); the build does not rename routes by language.

## Better translations: glossary and choosing the engine

The built-in model is free and runs on your machine, but it translates each string without knowing where it appears. You can improve it:

```ts
import reactAutolocale, { ollama } from "react-autolocale/vite";

reactAutolocale({
  // Terms that must always translate a given way (applied before the model sees the text)
  glossary: { fr: { Roadmap: "Feuille de route" }, es: { Roadmap: "Hoja de ruta" } },

  // Swap the engine. Free and local, through Ollama (https://ollama.com):
  engine: ollama({ model: "llama3.1" }),

  // ...or your own function: DeepL, an LLM API, anything. It is told where each string appears.
  // engine: async ({ texts, contexts, from, to }) => texts.map((t, i) => myTranslate(t, from, to, contexts[i])),
});
```

`contexts[i]` is the element or attribute the string sits in (`"button"`, `"a"`, `"h1"`, `"placeholder"`, ...), which is what lets a language model translate a lone "Home" in a nav bar correctly. The built-in model ignores it. Translations are cached, so you only pay for (or wait for) new and changed text.

## Language switcher

Switching is just navigation to `/fr/` (instant, no reload; a page load when `seo` is on). You choose the UI:

```bash
npx react-autolocale add switcher   # copies an editable LanguageSwitcher into src/components
```

or import the ready-made dropdown: `import { LanguageSwitcher } from "react-autolocale"`.

Build your own with the hook:

```tsx
const { language, languages, setLanguage, basePath } = useLanguage();
```

## What gets translated

- Static JSX text, plus `placeholder`, `title`, `alt` and `aria-label` on HTML elements.
- **Text with variables**: `<p>Welcome, {user.name}. You have {count} new messages</p>` is translated as one sentence (`Welcome, {name}. You have {count} new messages`) and your values are filled in at runtime. Variables must be plain names or property paths (`name`, `user.name`, `props.count`). Text mixed with function calls, conditions or nested elements is left as written. There is no plural handling, so write `{count} message(s)` or branch in your code.
- **Not translated**: anything with `translate="no"` (the standard HTML attribute, inherited by children), `exclude` phrases, `<code>` / `<pre>` / `<script>` / `<style>`, text made only of numbers and symbols, and data that arrives at runtime (API responses, user content).
- **Numbers** are kept exactly as written. The build checks that every digit (prices, phone numbers, hours, versions) survives translation and re-translates with the number locked if not. If that still fails, the original text is kept instead of shipping a wrong number. Use `useFormat()` (below) for numbers you compute.

```tsx
<p translate="no">Acme Cloud</p>                       // never translated
<section translate="no"><Terminal /></section>          // nothing inside is translated
```

## Supported languages

Use these codes in `languages={[...]}`. The source (`original`) language can be any of them.

| Code | Language | Model |
| --- | --- | --- |
| `fr` | French | OPUS-MT |
| `es` | Spanish | OPUS-MT |
| `de` | German | OPUS-MT |
| `it` | Italian | OPUS-MT |
| `nl` | Dutch | OPUS-MT |
| `ru` | Russian | OPUS-MT |
| `zh` | Chinese (Simplified) | OPUS-MT |
| `ar` | Arabic (RTL) | OPUS-MT |
| `hi` | Hindi | OPUS-MT |
| `sv` | Swedish | OPUS-MT |
| `da` | Danish | OPUS-MT |
| `fi` | Finnish | OPUS-MT |
| `cs` | Czech | OPUS-MT |
| `hu` | Hungarian | OPUS-MT |
| `ro` | Romanian | OPUS-MT |
| `uk` | Ukrainian | OPUS-MT |
| `vi` | Vietnamese | OPUS-MT |
| `id` | Indonesian | OPUS-MT |
| `pt` | Portuguese | NLLB |
| `ja` | Japanese | NLLB |
| `ko` | Korean | NLLB |
| `tr` | Turkish | NLLB |
| `pl` | Polish | NLLB |
| `no` | Norwegian | NLLB |
| `el` | Greek | NLLB |
| `he` | Hebrew (RTL) | NLLB |
| `th` | Thai | NLLB |
| `bn` | Bengali | NLLB |
| `fa` | Persian (RTL) | NLLB |
| `ur` | Urdu (RTL) | NLLB |
| `bg` | Bulgarian | NLLB |
| `hr` | Croatian | NLLB |
| `sk` | Slovak | NLLB |
| `ca` | Catalan | NLLB |
| `ms` | Malay | NLLB |
| `sw` | Swahili | NLLB |
| `tl` | Tagalog | NLLB |
| `en` | English (default source) | NLLB when used as a target |

OPUS-MT models are small (about 75 MB each) and are used when the source language is English. NLLB-200 is one larger download (about 600 MB) shared by all the languages marked NLLB, and is also used for any non-English source. Right-to-left languages automatically get `dir="rtl"` on the page.

### Quality by language

Every supported language was run through the real models on sample UI sentences: all 37 produce output in the right writing system, with no runaway or repeated text. How good that output is varies. French, Spanish, German, Italian, Dutch, Swedish, Danish, Japanese and Korean read naturally on ordinary sentences. Short imperative labels are the weak spot in many languages: "Save 20%" comes back as "save a file" in Russian, Ukrainian, Hungarian, Hindi and Romanian, "Sign in" comes back wrong in Russian, Chinese, Arabic and Vietnamese, and Arabic and Vietnamese could not keep the number in "Save 20% on your first order" (the original English is kept for such strings rather than risking a wrong number). Treat these as drafts: review the languages you ship in `react-autolocale.overrides.json`, add a `glossary` for key terms, or use an `engine` that gets context (see below). You can re-run the check yourself with `RUN_MODELS=1 pnpm exec vitest run test/models.test.ts`.

## Translations and caching

Translations are generated on first build into `node_modules/.cache/react-autolocale/` and reused; only new or changed strings are translated afterwards. Cache that folder in CI. Models download once into `~/.cache/react-autolocale` (about 75 MB per OPUS-MT language, about 600 MB for NLLB: Japanese, Korean, Portuguese and others). The dev server translates text you add while it runs and reloads.

## Automatic language navigation

Whether a visitor is moved depends on the URL they land on:

| Where they land | What happens |
| --- | --- |
| `/` or `/about` (no language in the URL) | Sent to their saved language, otherwise their browser language, if you support it (a French browser lands on `/fr/about`). |
| `/en/about` or `/fr/about` (explicit language URL) | Never redirected. The page they asked for is the page they get. |

- A language chosen in the switcher is remembered and wins on later visits. The browser language itself is not saved; it is checked each time.
- The browser's language setting is used, not the visitor's physical location. Unsupported browser languages stay on the original.
- The root page redirects before it paints, so visitors don't see a flash of the wrong language.

This follows common practice. Redirecting the bare root by browser language is widespread, while forcing visitors off an explicit language URL is avoided: shared links and search results should open the page they point to, redirect loops are avoided, and it respects someone who chose a language on purpose. Search engines are told which URL belongs to which language through `hreflang` tags (see SEO below), so a French searcher is normally shown the `/fr/` URL in the first place. Visitors who land on another language's URL can use the language switcher.

## Suggesting the visitor's language (optional banner)

Instead of forcing a redirect on an explicit URL, you can offer the visitor their browser language: a French visitor on `/en/about` sees "Cette page est également disponible en Français." with a button to switch and one to dismiss. It appears only when the browser language is supported and differs from the page, is shown after the page loads (so it never changes the HTML search engines see), remembers a dismissal, and stays hidden once the visitor has picked a language. The text is shown in the visitor's own language.

It is off unless you add it, and you decide how it looks:

```tsx
import { LanguageBanner } from "react-autolocale";

<LanguageBanner />                                   // ready-made bar, style it with className / style
<LanguageBanner className="my-bar" />                // your own CSS replaces the default look

<LanguageBanner>                                     // or build the markup yourself
  {(s) => (
    <aside>
      {s.text} <button onClick={s.accept}>{s.switchLabel}</button>
      <button onClick={s.dismiss}>{s.dismissLabel}</button>
    </aside>
  )}
</LanguageBanner>
```

Prefer to own the component? `npx react-autolocale add banner` copies an editable `LanguageBanner` into your project. For full control use the hook, `useLanguageSuggestion()`, which returns `null` or `{ language, native, text, switchLabel, dismissLabel, accept, dismiss }`.

## SEO (opt-in)

By default react-autolocale does not touch your SEO: the only changes to `<head>` are one inline script holding that page's translations, plus `lang` and `dir` on `<html>`.

Turn it on with `seo` on the provider:

```tsx
<AutoScale original="en" languages={["fr", "es"]} seo siteUrl="https://example.com">
  <App />
</AutoScale>
```

With `seo` the build also:
- translates `<title>` and the description / Open Graph / Twitter meta tags,
- adds `<link rel="canonical">` and `hreflang` alternates (plus `x-default`) to every page,
- writes `sitemap.xml` with the alternates (needs `siteUrl`; reference it from your `robots.txt`).

With `seo`, switching language navigates to the real page (so its head tags are correct) instead of swapping in place. Brand names in the title are translated like any text, so add them to `exclude`.

## Limits

- Data that arrives at runtime (API responses, user-written content) is not translated: it does not exist at build time. Text you write in JSX around those values is.
- Variables in text must be plain names or property paths; no plural rules.
- Dynamic routes (`/users/:id`) only get pages you list in `routes`, or that are linked.
- `<AutoScale>` props must be literals so the plugin can read them at build time.
- Use Vite's default `base: "/"`.
- Machine translation is draft quality. Short labels, long sentences with variables and less common languages need a human look: use the overrides file.
