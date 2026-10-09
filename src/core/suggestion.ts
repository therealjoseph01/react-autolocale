/**
 * Should we offer the visitor another language? Looks at the first browser language we support:
 * if it is the page's own language, was dismissed, or the visitor already chose a language, offer nothing.
 */
export function suggestLanguage(opts: {
  browser: readonly string[];
  codes: readonly string[];
  current: string;
  dismissed: readonly string[];
  chosen: boolean;
}): string | null {
  if (opts.chosen) return null;
  for (const tag of opts.browser) {
    const lower = String(tag).toLowerCase();
    const base = lower.split("-")[0]!;
    const code = opts.codes.includes(lower) ? lower : opts.codes.includes(base) ? base : null;
    if (!code) continue;
    return code === opts.current || opts.dismissed.includes(code) ? null : code;
  }
  return null;
}

export const DISMISSED_KEY = "react-autolocale:banner-dismissed";

export interface BannerText {
  /** {language} is replaced by the suggested language's own name in every field. */
  prompt: string;
  switch: string;
  dismiss: string;
}

export const BANNER_EN: BannerText = {
  prompt: "This page is also available in {language}.",
  switch: "Read in {language}",
  dismiss: "Not now",
};
