import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { redirectTarget, STORAGE_KEY } from "../core/redirect.js";
import { original, originalNative, seo, languages, loaders } from "virtual:react-autolocale";

type Dict = Record<string, string>;

declare global {
  interface Window {
    /** Written into every generated page so the first render already has its translations. */
    __AUTOSCALE__?: { lang: string; dict: Dict };
  }
}

const hasDom = typeof window !== "undefined" && typeof document !== "undefined";
const codes = new Set([original, ...languages.map((l) => l.code)]);
const cache = new Map<string, Dict>();
const PREFIX = /^\/([a-z]{2,3})(?=\/|$)/i;

function prefixOf(pathname: string): string | null {
  const code = PREFIX.exec(pathname)?.[1]?.toLowerCase();
  return code && codes.has(code) ? code : null;
}

function pathFor(code: string): string {
  const { pathname, search, hash } = window.location;
  const rest = prefixOf(pathname) ? pathname.replace(PREFIX, "") || "/" : pathname;
  return `/${code}${rest}${search}${hash}`;
}

function load(code: string): Promise<Dict> {
  const hit = cache.get(code);
  if (hit) return Promise.resolve(hit);
  const loader = loaders[code];
  if (!loader) return Promise.resolve({});
  return loader()
    .then((m) => m.default)
    .catch(() => ({}))
    .then((dict) => (cache.set(code, dict), dict));
}

interface State {
  language: string;
  dict: Dict;
}

interface Ctx extends State {
  setLanguage: (code: string) => Promise<void>;
}

const Context = createContext<Ctx>({ language: original, dict: {}, setLanguage: async () => {} });

function initialState(): State {
  if (!hasDom) return { language: original, dict: {} };
  const boot = window.__AUTOSCALE__;
  const language = boot?.lang ?? prefixOf(window.location.pathname) ?? original;
  if (boot) cache.set(boot.lang, boot.dict);
  return { language, dict: language === original ? {} : (cache.get(language) ?? {}) };
}

export interface AutoScaleProps {
  /** Language the app is written in, e.g. "en". Must be a literal so the build can read it. */
  original: string;
  /** Languages to generate, e.g. ["fr", "es"]. Must be a literal. */
  languages: string[];
  /** Phrases that must never be translated, such as brand names. Must be a literal. */
  exclude?: string[];
  /**
   * Opt in to SEO changes at build time: translated title/meta tags, canonical and hreflang links,
   * and a sitemap. Off by default: nothing in <head> is touched. Must be a literal.
   */
  seo?: boolean | "true";
  /** Public site URL (e.g. "https://example.com"); used by `seo` for absolute links and the sitemap. */
  siteUrl?: string;
  children?: ReactNode;
}

/**
 * Wrap your app once. Language comes from the URL (/fr/...), so every language is a real, static page.
 * The props are read at build time by the Vite plugin.
 */
export function AutoScale({ children }: AutoScaleProps): ReactElement {
  const [state, setState] = useState<State>(initialState);

  const apply = useCallback(async (code: string, push: boolean) => {
    if (!codes.has(code)) return;
    if (push && hasDom) {
      try {
        window.localStorage.setItem(STORAGE_KEY, code);
      } catch {
        /* storage unavailable */
      }
      // With seo on, every language is a real page with its own head tags, so navigate to it.
      if (seo) {
        window.location.assign(pathFor(code));
        return;
      }
    }
    const dict = code === original ? {} : await load(code);
    setState({ language: code, dict });
    if (push && hasDom) window.history.pushState(null, "", pathFor(code));
  }, []);

  const setLanguage = useCallback((code: string) => apply(code, true), [apply]);

  useEffect(() => {
    document.documentElement.lang = state.language;
    document.documentElement.dir = languages.find((l) => l.code === state.language)?.rtl ? "rtl" : "ltr";
  }, [state.language]);

  // First visit on an un-prefixed URL: move the visitor to their saved or browser language.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    const to = redirectTarget({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      saved,
      browser: window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language],
      codes: [...codes],
      original,
    });
    if (to) window.location.replace(to);
  }, []);

  // Dev server has no pre-rendered dictionary: fetch it on first load.
  useEffect(() => {
    if (state.language !== original && !cache.has(state.language)) void apply(state.language, false);
    const onPop = () => void apply(prefixOf(window.location.pathname) ?? original, false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [apply]);

  const value = useMemo(() => ({ ...state, setLanguage }), [state, setLanguage]);
  return createElement(Context.Provider, { value }, children);
}

/** @internal Inserted by the Vite plugin in place of static JSX text. */
export function __T({ s }: { s: string }): ReactElement {
  const { dict } = useContext(Context);
  return createElement(Fragment, null, dict[s] ?? s);
}

/** @internal Inserted by the Vite plugin for translated attributes (placeholder, alt, ...). */
export function __useT(): (s: string) => string {
  const { dict } = useContext(Context);
  return useCallback((s: string) => dict[s] ?? s, [dict]);
}

export interface LanguageApi {
  language: string;
  /** Switches language and updates the URL; resolves once translations are loaded. */
  setLanguage: (code: string) => Promise<void>;
  /** All languages, original first. */
  languages: { code: string; native: string }[];
  /** "/fr" - pass to your router's basename if you use client-side routing. */
  basePath: string;
}

export function useLanguage(): LanguageApi {
  const { language, setLanguage } = useContext(Context);
  return useMemo(
    () => ({
      language,
      setLanguage,
      languages: [{ code: original, native: originalNative }, ...languages],
      basePath: `/${language}`,
    }),
    [language, setLanguage],
  );
}

export interface LanguageSwitcherProps {
  className?: string;
  style?: CSSProperties;
  /** Accessible label for the dropdown. */
  label?: string;
}

/** A dropdown that switches the whole app's language instantly, without a reload. */
export function LanguageSwitcher({ className, style, label = "Language" }: LanguageSwitcherProps): ReactElement {
  const { language, languages: all, setLanguage } = useLanguage();
  return createElement(
    "select",
    {
      className,
      style,
      value: language,
      "aria-label": label,
      onChange: (e: { target: { value: string } }) => void setLanguage(e.target.value),
    },
    all.map((l) => createElement("option", { key: l.code, value: l.code }, l.native)),
  );
}
