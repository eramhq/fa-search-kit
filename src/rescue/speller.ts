/**
 * The speller: the closest word of the site to a word the index does not know.
 *
 * A weighted edit distance (deletions, insertions, substitutions, swapped
 * neighbours), costed for Persian: sound-alike letters and keys next to each
 * other are cheap, other substitutions dear. Best by cost, then by how often the
 * site uses the word.
 */
import type { Piece, Word } from "./words.ts";

/** Letters that sound alike; ا/ع only at the start of a word (a medial ا is a long vowel). */
const SOUND = ["زذضظ", "ثسص", "تط", "حه", "غق"];
const SOUND_COST = 0.3;
/** Letter rows of the standard Persian keyboard (ISIRI 9147), for neighbouring keys. */
const ROWS = "ضصثقفغعهخحجچ شسیبلاتنمکگ ظطزرذدپو";

function substitution(a: string, b: string, first: boolean): number {
  if (a === b) return 0;
  if (SOUND.some((g) => g.includes(a) && g.includes(b)) || (first && "اع".includes(a) && "اع".includes(b))) return SOUND_COST;
  return ROWS.includes(a + b) || ROWS.includes(b + a) ? 0.6 : 1;
}
/** Dropping or adding a letter; a doubled letter or a long vowel costs less. */
const gap = (s: string, i: number) => (s[i] === s[i - 1] || s[i] === s[i + 1] ? 0.5 : "اوی".includes(s[i]!) ? 0.8 : 1);

/** The weighted distance between `a` and `b` (optimal string alignment), or Infinity once it exceeds `cap`. */
export function distance(a: string, b: string, cap: number): number {
  const n = a.length, m = b.length;
  let prev2: number[] = [], prev: number[] = [0];
  for (let j = 1; j <= m; j++) prev[j] = prev[j - 1]! + gap(b, j - 1);
  for (let i = 1; i <= n; i++) {
    const row = [prev[0]! + gap(a, i - 1)];
    let low = row[0]!;
    for (let j = 1; j <= m; j++) {
      const x = a[i - 1]!, y = b[j - 1]!;
      let d = Math.min(prev[j]! + gap(a, i - 1), row[j - 1]! + gap(b, j - 1), prev[j - 1]! + substitution(x, y, i + j === 2));
      if (i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y && x !== y) d = Math.min(d, prev2[j - 2]! + 0.8);
      row[j] = d;
      if (d < low) low = d;
    }
    if (low > cap) return Infinity;
    prev2 = prev;
    prev = row;
  }
  return prev[m]! <= cap ? prev[m]! : Infinity;
}

/**
 * How far a word of this length may be from its fix: one edit, and for 3 letters only a
 * sound-alike swap (full edits there, distance 2, plain costs, a minimum count and a cost
 * cap all lost on the benchmark: bench/results/experiments.md, R3, R6–R8, R10).
 */
export const reach = (length: number): number => (length < 3 ? 0 : length < 4 ? SOUND_COST : 1);

/**
 * The best fix for `key` (a word key, see words.ts) among the words of `pieces`, with how
 * many times more often the site uses it than `key`; undefined when none is close enough,
 * or when the site has the word itself (with `rare`: unless the fix is 10× as common).
 */
export function spell(key: string, pieces: (Piece | undefined)[], rare = false): [spelling: string, count: number, ratio: number] | undefined {
  const cap = reach(key.length);
  if (!cap) return undefined;
  const own = pieces.find((p) => p?.has(key))?.get(key)?.[1];
  // A suspect (`rare`) is a word of the list; one the list lacks is not evidence of a typo.
  if (own ? !rare : rare) return undefined;
  const min = 10 * (own ?? 0);
  let best: Word | undefined, bestCost = Infinity;
  for (const piece of pieces) {
    if (!piece) continue;
    for (const [k, word] of piece) {
      if (word[1] < min || k === key || Math.abs(k.length - key.length) > Math.floor(cap)) continue;
      const d = Math.round(10 * distance(key, k, cap)) / 10; // 0.3 + 0.6 = 0.6 + 0.3
      if (d < bestCost || (d === bestCost && best && word[1] > best[1])) { best = word; bestCost = d; }
    }
  }
  return best && [best[0], best[1], best[1] / (own ?? 1)];
}
