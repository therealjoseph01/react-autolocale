/**
 * Where should a visitor on an un-prefixed URL (like "/" or "/about") be sent?
 * Saved choice wins, then the browser's language list. Returns null to stay put.
 */
export function redirectTarget(opts: {
  pathname: string;
  search?: string;
  hash?: string;
  saved?: string | null;
  browser: readonly string[];
  codes: readonly string[];
  original: string;
}): string | null {
  const { pathname, codes, original } = opts;
  const prefix = /^\/([a-z]{2,3})(?=\/|$)/i.exec(pathname)?.[1]?.toLowerCase();
  if (prefix && codes.includes(prefix)) return null; // an explicit language URL always wins

  let target: string | null = opts.saved && codes.includes(opts.saved) ? opts.saved : null;
  for (const tag of opts.browser) {
    if (target) break;
    const lower = String(tag).toLowerCase();
    if (codes.includes(lower)) target = lower;
    else if (codes.includes(lower.split("-")[0]!)) target = lower.split("-")[0]!;
  }
  if (!target || target === original) return null;
  return `/${target}${pathname}${opts.search ?? ""}${opts.hash ?? ""}`;
}

export const STORAGE_KEY = "react-autolocale:language";

/** The same logic as a tiny inline script, so the root page redirects before anything paints. */
export function redirectScript(codes: readonly string[], original: string): string {
  return (
    `(function(){try{var C=${JSON.stringify(codes)},O=${JSON.stringify(original)},p=location.pathname,` +
    `m=/^\\/([a-z]{2,3})(?=\\/|$)/i.exec(p);if(m&&C.indexOf(m[1].toLowerCase())>-1)return;` +
    `var t=null,s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(s&&C.indexOf(s)>-1)t=s;` +
    `var l=navigator.languages||[navigator.language];for(var i=0;i<l.length&&!t;i++){` +
    `var c=String(l[i]).toLowerCase();if(C.indexOf(c)>-1)t=c;else if(C.indexOf(c.split("-")[0])>-1)t=c.split("-")[0]}` +
    `if(t&&t!==O)location.replace("/"+t+p+location.search+location.hash)}catch(e){}})()`
  );
}
