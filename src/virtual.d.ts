declare module "virtual:react-autolocale" {
  export interface LanguageMeta {
    code: string;
    native: string;
    rtl: boolean;
  }
  export const original: string;
  export const originalNative: string;
  /** Target languages (not including the original). */
  export const languages: LanguageMeta[];
  export const loaders: Record<string, () => Promise<{ default: Record<string, string> }>>;
}
