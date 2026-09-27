/**
 * Persian text normalization with an offset map back to the original text.
 *
 * Order: Arabic presentation forms go through NFKC one character at a time,
 * then letters are folded. ZWNJ is kept (Snowball's stemmer needs it to find
 * prefixes), but runs collapse to one and it is dropped where it does not sit
 * between two letters.
 */

export interface NormalizeOptions {
  /** ئ → ی. Snowball does this itself; the stemmer-less profile needs it here. */
  hamzaYeh?: boolean;
}

export interface Normalized {
  text: string;
  /**
   * Where each output character came from: `map[2k]` and `map[2k + 1]` are the
   * start and end (UTF-16 offsets) of the original text that produced `text[k]`.
   * One original character can produce several output characters (ﷺ).
   */
  map: Uint32Array;
}

export const ZWNJ = "\u200C";

/** Single-letter folds: Arabic letters to Persian ones, alef and waw hamza forms. */
const FOLDS: Record<string, string> = {
  "\u064A": "ی", "\u0649": "ی", "\u0643": "ک", "\u06AA": "ک", "\u0629": "ه", "\u06C0": "ه", "\u06C1": "ه", "\u06C2": "ه",
  "\u0623": "ا", "\u0625": "ا", "\u0671": "ا", "\u0624": "و",
};
/** Harakat, tanwin, shadda, sukun, hamza marks, superscript alef, tatweel, ZWJ, bidi controls, BOM. */
const removed = (c: number) =>
  (c >= 0x064b && c <= 0x065f) || c === 0x0670 || c === 0x0640 || (c >= 0x200d && c <= 0x200f) ||
  (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0x061c || c === 0xfeff;
/** Arabic presentation forms A and B: decomposed by NFKC. */
const presentation = (c: number) => (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfefe);
/** ZWSP and ¬, typed in place of a ZWNJ on some keyboards; become one only between letters. */
const soft = (c: number) => c === 0x200b || c === 0x00ac;
const LETTER = /\p{L}/u;
const arabicLetter = (c: number) => (c >= 0x0620 && c <= 0x064a) || (c >= 0x066e && c <= 0x06d3) || c === 0x06d5 || (c >= 0x06fa && c <= 0x06ff);

function foldChar(ch: string, o: NormalizeOptions): string {
  const code = ch.charCodeAt(0);
  if (removed(code)) return "";
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code === 0x0626 && o.hamzaYeh) return "ی";
  if (code < 0x41) return ch;
  return FOLDS[ch] ?? (code < 0x0600 ? ch.toLowerCase() : ch);
}

/** Shared by `normalize` and the analyzer; `withMap` only decides whether offsets are recorded. */
export function normalizeText(input: string, options: NormalizeOptions = {}, withMap = false): Normalized {
  // Pass 1: fold and remove, one output character per entry.
  const chars: string[] = [];
  const spans: number[] = [];
  let i = 0;
  for (const cp of input) {
    const end = i + cp.length;
    const expanded = presentation(cp.charCodeAt(0)) ? cp.normalize("NFKC") : cp;
    for (const ch of expanded) {
      const out = soft(ch.charCodeAt(0)) ? ch : foldChar(ch, options);
      // A removed mark belongs to the letter before it («قبلاً» spans its tanwin).
      if (!out && withMap && spans.length) spans[spans.length - 1] = end;
      for (const c of out) {
        chars.push(c);
        if (withMap) spans.push(i, end);
      }
    }
    i = end;
  }

  // Pass 2: ZWNJ only between letters (runs collapse), soft ZWNJs likewise,
  // and 3+ repeats of one Arabic-script letter collapse to one («سلامممم»).
  let text = "";
  const map: number[] = [];
  const emit = (c: string, from: number, to: number) => {
    text += c;
    if (withMap) map.push(spans[2 * from]!, spans[2 * to + 1]!);
  };
  for (let k = 0; k < chars.length; k++) {
    const c = chars[k]!;
    const code = c.charCodeAt(0);
    if (code === 0x200c || soft(code)) {
      let j = k;
      while (j + 1 < chars.length && (chars[j + 1] === ZWNJ || soft(chars[j + 1]!.charCodeAt(0)))) j++;
      const between = k > 0 && LETTER.test(chars[k - 1]!) && j + 1 < chars.length && LETTER.test(chars[j + 1]!);
      if (between) emit(ZWNJ, k, j);
      else for (let s = k; s <= j; s++) if (chars[s] === "\u00AC") emit(chars[s]!, s, s);
      k = j;
      continue;
    }
    if (arabicLetter(code) && chars[k + 1] === c) {
      let j = k;
      while (j + 1 < chars.length && chars[j + 1] === c) j++;
      if (j - k >= 2) { emit(c, k, j); k = j; continue; }
    }
    emit(c, k, k);
  }
  return { text, map: Uint32Array.from(map) };
}

export const normalize = (text: string, options?: NormalizeOptions): Normalized => normalizeText(text, options, true);
