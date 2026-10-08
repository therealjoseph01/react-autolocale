export interface LanguageInfo {
  /** ISO 639-1 code used in config, JSON file names and the switcher. */
  code: string;
  /** Name in its own language, shown in the switcher. */
  native: string;
  /** English name, shown in the CLI. */
  english: string;
  /** FLORES-200 code used by the NLLB model. */
  nllb: string;
  /** Xenova/opus-mt-en-<opus> exists for English -> this language. */
  opus?: string;
  rtl?: boolean;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "en", native: "English", english: "English", nllb: "eng_Latn" },
  { code: "fr", native: "Français", english: "French", nllb: "fra_Latn", opus: "fr" },
  { code: "es", native: "Español", english: "Spanish", nllb: "spa_Latn", opus: "es" },
  { code: "de", native: "Deutsch", english: "German", nllb: "deu_Latn", opus: "de" },
  { code: "it", native: "Italiano", english: "Italian", nllb: "ita_Latn", opus: "it" },
  { code: "pt", native: "Português", english: "Portuguese", nllb: "por_Latn" },
  { code: "nl", native: "Nederlands", english: "Dutch", nllb: "nld_Latn", opus: "nl" },
  { code: "ru", native: "Русский", english: "Russian", nllb: "rus_Cyrl", opus: "ru" },
  { code: "zh", native: "中文", english: "Chinese (Simplified)", nllb: "zho_Hans", opus: "zh" },
  { code: "ja", native: "日本語", english: "Japanese", nllb: "jpn_Jpan" },
  { code: "ko", native: "한국어", english: "Korean", nllb: "kor_Hang" },
  { code: "ar", native: "العربية", english: "Arabic", nllb: "arb_Arab", opus: "ar", rtl: true },
  { code: "hi", native: "हिन्दी", english: "Hindi", nllb: "hin_Deva", opus: "hi" },
  { code: "tr", native: "Türkçe", english: "Turkish", nllb: "tur_Latn" },
  { code: "pl", native: "Polski", english: "Polish", nllb: "pol_Latn" },
  { code: "sv", native: "Svenska", english: "Swedish", nllb: "swe_Latn", opus: "sv" },
  { code: "da", native: "Dansk", english: "Danish", nllb: "dan_Latn", opus: "da" },
  { code: "no", native: "Norsk", english: "Norwegian", nllb: "nob_Latn" },
  { code: "fi", native: "Suomi", english: "Finnish", nllb: "fin_Latn", opus: "fi" },
  { code: "cs", native: "Čeština", english: "Czech", nllb: "ces_Latn", opus: "cs" },
  { code: "hu", native: "Magyar", english: "Hungarian", nllb: "hun_Latn", opus: "hu" },
  { code: "ro", native: "Română", english: "Romanian", nllb: "ron_Latn", opus: "ro" },
  { code: "uk", native: "Українська", english: "Ukrainian", nllb: "ukr_Cyrl", opus: "uk" },
  { code: "el", native: "Ελληνικά", english: "Greek", nllb: "ell_Grek" },
  { code: "he", native: "עברית", english: "Hebrew", nllb: "heb_Hebr", rtl: true },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese", nllb: "vie_Latn", opus: "vi" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian", nllb: "ind_Latn", opus: "id" },
  { code: "th", native: "ไทย", english: "Thai", nllb: "tha_Thai" },
  { code: "bn", native: "বাংলা", english: "Bengali", nllb: "ben_Beng" },
  { code: "fa", native: "فارسی", english: "Persian", nllb: "pes_Arab", rtl: true },
  { code: "ur", native: "اردو", english: "Urdu", nllb: "urd_Arab", rtl: true },
  { code: "bg", native: "Български", english: "Bulgarian", nllb: "bul_Cyrl" },
  { code: "hr", native: "Hrvatski", english: "Croatian", nllb: "hrv_Latn" },
  { code: "sk", native: "Slovenčina", english: "Slovak", nllb: "slk_Latn" },
  { code: "ca", native: "Català", english: "Catalan", nllb: "cat_Latn" },
  { code: "ms", native: "Bahasa Melayu", english: "Malay", nllb: "zsm_Latn" },
  { code: "sw", native: "Kiswahili", english: "Swahili", nllb: "swh_Latn" },
  { code: "tl", native: "Tagalog", english: "Tagalog", nllb: "tgl_Latn" },
];

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string): LanguageInfo | undefined {
  return byCode.get(code);
}

export function isRtl(code: string): boolean {
  return !!byCode.get(code)?.rtl;
}
