declare module "virtual:react-autolocale" {
  export interface LanguageMeta {
    code: string;
    native: string;
    rtl: boolean;
  }
  export const original: string;
  export const originalNative: string;
  /** <AutoScale seo> was set: switching language navigates to the real page. */
  export const seo: boolean;
  /** Target languages (not including the original). */
  export const languages: LanguageMeta[];
  export const loaders: Record<string, () => Promise<{ default: Record<string, string> }>>;
}
