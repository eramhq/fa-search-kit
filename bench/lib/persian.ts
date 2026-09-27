/**
 * Minimal Persian text helpers for building the benchmark (not the product
 * analyzer; that lives in src/ from Phase 1). Kept deliberately naive: query
 * construction must not quietly depend on the analyzer it is meant to judge.
 */

export const ZWNJ = "\u200C";
export const AR_YEH = "ي"; // ي
export const AR_ALEF_MAKSURA = "ى"; // ى
export const AR_KAF = "ك"; // ك
export const FA_YEH = "ی"; // ی
export const FA_KAF = "ک"; // ک

/** Harakat, tanwin, shadda, sukun, superscript alef, hamza above/below marks. */
export const DIACRITICS = /[ً-ٰٟ]/g;
export const TATWEEL = /ـ/g;
export const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Raw tokens: runs of letters, marks, digits and ZWNJ. Nothing is folded. */
export function rawTokens(text: string): string[] {
  return text.split(/[^\p{L}\p{M}\p{N}\u200C]+/u).map((t) => t.replace(/^\u200C+|\u200C+$/g, "")).filter(Boolean);
}

/** Contains an Arabic-script letter (not just Persian/Arabic digits or punctuation). */
export const isArabicScript = (token: string) => /[\u0620-\u064A\u066E-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF]/.test(token);
export const isLatin = (token: string) => /^[A-Za-z][A-Za-z0-9\-]*$/.test(token);
export const hasDigit = (token: string) => /[0-9۰-۹٠-٩]/.test(token);

/**
 * What a person on a standard Persian keyboard would type for text they read:
 * Persian yeh/kaf, no diacritics or tatweel. Used to tell doc-side mess apart
 * from query-side mess.
 */
export function standardTyping(text: string): string {
  return text
    .replaceAll(AR_YEH, FA_YEH).replaceAll(AR_ALEF_MAKSURA, FA_YEH).replaceAll(AR_KAF, FA_KAF)
    .replaceAll("\u0629", "\u0647") // ة → ه
    .replace(DIACRITICS, "").replace(TATWEEL, "");
}

/**
 * Letter groups that sound the same in Persian (a common spelling-error source).
 * ا/ع is left out: a medial alef is a long vowel, so «انجعم» is not a sound-alike
 * of «انجام». Word-final ه is skipped by the generator for the same reason (silent).
 */
export const HOMOPHONES: string[][] = [
  ["ز", "ذ", "ض", "ظ"],
  ["س", "ص", "ث"],
  ["ت", "ط"],
  ["ه", "ح"],
  ["ق", "غ"],
];
