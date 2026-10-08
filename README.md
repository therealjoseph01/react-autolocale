# react-autolocale

Wrap your React + Vite app in one component. `vite build` produces a fully translated static page for every language (`/en/`, `/fr/`, `/es/`, ...) using a free local translation model. No `t()`, no keys, no translation files in your repo, and your source code stays untouched.

```bash
npm install react-autolocale
```

```ts
// vite.config.ts
import reactAutolocale from "react-autolocale/vite";
export default defineConfig({ plugins: [reactAutolocale(), react()] });
```

```tsx
// main.tsx
import { AutoScale } from "react-autolocale";

createRoot(document.getElementById("root")!).render(
  <AutoScale original="en" languages={["fr", "es", "de", "pt"]} exclude={["Acme Cloud"]}>
    <App />
  </AutoScale>,
);
```

Write normal JSX, then run `npm run build`. The output folder contains one page per language, deployable anywhere static files are served.

## Multi-page apps (React Router)

Every page is generated: the build renders each language's home page, follows the internal links it finds, and writes a static page for each (`/fr/`, `/fr/about/`, `/fr/contact/`, ...). Pages only reachable by typing a URL, with no link to them, are not found.

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

Machine translation sometimes gets short UI words wrong (a nav link "Home" may come back as "Sommaire"). Correct any string in the plugin options; overrides always win:

```ts
reactAutolocale({ overrides: { fr: { Home: "Accueil" }, es: { Home: "Inicio" } } })
```

## Language switcher

Switching is just navigation to `/fr/` (instant, no reload). You choose the UI:

```bash
npx react-autolocale add switcher   # copies an editable LanguageSwitcher into src/components
```

or import the ready-made dropdown: `import { LanguageSwitcher } from "react-autolocale"`.

Build your own with the hook:

```tsx
const { language, languages, setLanguage, basePath } = useLanguage();
```

## What gets translated

Static JSX text, plus `placeholder`, `title`, `alt`, `aria-label` on HTML elements. `exclude` phrases (brand names) are kept as-is, even inside longer sentences.

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

## Translations and caching

Translations are generated on first build into `node_modules/.cache/react-autolocale/` and reused; only new or changed strings are translated afterwards. Cache that folder in CI. Models download once into `~/.cache/react-autolocale` (about 75 MB per OPUS-MT language, about 600 MB for NLLB: Japanese, Korean, Portuguese and others). The dev server translates text you add while it runs and reloads.

## Not touched in v1

SEO is intentionally left alone: no `hreflang`, canonical tags, sitemap, or title/meta translation. The only head change is one inline script holding that page's translations, plus `lang` and `dir` on `<html>`.

## v1 limits

- Dynamic content (`Hello {name}`, API data) is not translated; planned for v1.5. Text next to `{expressions}` stays in the original language.
- Routes are found by following links. Routes with dynamic params (`/users/:id`) only get the pages that are linked.
- `<AutoScale>` props must be literals so the plugin can read them at build time.
- Use Vite's default `base: "/"`.
- Machine translation is draft quality.
