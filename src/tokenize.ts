/**
 * Split normalized text into words, with offsets into the original text, and
 * rejoin affixes that were typed with a space instead of a half-space
 * («می روم» → «می‌روم», «کتاب ها» → «کتاب‌ها»), so every spelling of a word is
 * one token.
 */
import { ZWNJ, type Normalized } from "./normalize.ts";

export interface Token {
  /** Normalized text. */
  text: string;
  /** Offsets into the original text. */
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}\p{M}\u200C]+/gu;
const ARABIC = /[\u0620-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF]/;
/** Only spaces between the two words: never across punctuation or a line break. */
const GAP = /^[^\S\n\r\u2028\u2029]+$/;
const PREFIXES = new Set(["می", "نمی"]);
const SUFFIXES = new Set(["ها", "های", "هایی", "هایم", "هایت", "هایش", "هایمان", "هایتان", "هایشان", "تر", "ترین"]);
/**
 * Verb endings, ezafe ی, indefinite ای and possessive اش: written joined after a
 * consonant, so a spaced one is its own word there (the vocative «ای خدا»). Only
 * after a vowel letter is the space a half-space typed wrong («خسته اید», «نامه ای»).
 */
const VOWEL_SUFFIXES = new Set(["ی", "ای", "ام", "اش", "اید", "ایم", "اند"]);
const VOWEL_END = /[هاوی]$/;

export function tokenize(n: Normalized, rejoin = true): Token[] {
  const words: { text: string; s: number; e: number }[] = [];
  for (const m of n.text.matchAll(WORD)) words.push({ text: m[0], s: m.index, e: m.index + m[0].length });
  const tokens: { text: string; s: number; e: number }[] = [];
  for (let k = 0; k < words.length; k++) {
    const w = words[k]!;
    const prev = tokens.at(-1);
    const gap = prev ? n.text.slice(prev.e, w.s) : "";
    if (rejoin && prev && GAP.test(gap) && ARABIC.test(prev.text) && ARABIC.test(w.text)) {
      const joinPrefix = PREFIXES.has(prev.text) && w.text.length >= 2;
      const joinSuffix = SUFFIXES.has(w.text) || (VOWEL_SUFFIXES.has(w.text) && VOWEL_END.test(prev.text));
      if (joinPrefix || joinSuffix) {
        prev.text += ZWNJ + w.text;
        prev.e = w.e;
        continue;
      }
    }
    tokens.push({ ...w });
  }
  const map = n.map;
  // Without a map (the analyzer's fast path) offsets stay in normalized text.
  if (!map.length) return tokens.map((t) => ({ text: t.text, start: t.s, end: t.e }));
  return tokens.map((t) => ({ text: t.text, start: map[2 * t.s]!, end: map[2 * (t.e - 1) + 1]! }));
}
