/**
 * Mining shared by scripts/build-lexicon.ts and scripts/build-lemma.ts: the
 * vocabulary in normalized form, the plural test, and Hazm's verb pairs.
 *
 * Inputs: Hazm's verb list (MIT) and bench/data/vocab.tsv (word counts over the
 * raw benchmark sources). Only single words and counts are taken from the
 * vocabulary, never text.
 */
import { readFileSync } from "node:fs";
import { normalizeText } from "../../src/normalize.ts";
import { conjugate } from "../../bench/lib/verbs.ts";

const root = new URL("../..", import.meta.url);
export const ZWNJ = "‌";
const ARABIC = /^[ؠ-يٮ-ۓەۺ-ۿ‌]+$/;

// --- vocabulary, in normalized form -------------------------------------------------

export const vocab = new Map<string, number>();
for (const line of readFileSync(new URL("bench/data/vocab.tsv", root), "utf8").split("\n")) {
  const tab = line.indexOf("\t");
  if (tab < 0) continue;
  // Normalized exactly as the analyzer's default does, so keys match what the stemmer sees.
  const w = normalizeText(line.slice(0, tab), { hamzaYeh: true }).text;
  if (ARABIC.test(w)) vocab.set(w, (vocab.get(w) ?? 0) + Number(line.slice(tab + 1)));
}
export const count = (w: string) => vocab.get(w) ?? 0;
/**
 * Takes a plural itself (≥ 1% of its own count): a word, not word + suffix. «+ان»
 * counts only when the word does not end in م/ت/ش, where it would read as a clitic
 * (کتابش + ان = کتابشان).
 */
export function pluralizable(w: string): boolean {
  const plural = count(w + "ها") + count(w + ZWNJ + "ها") + count(w + "های") + count(w + ZWNJ + "های") + (/[متش]$/.test(w) ? 0 : count(w + "ان"));
  return plural >= 3 && plural >= 0.01 * count(w);
}

// --- verbs --------------------------------------------------------------------------

/** Hazm's past#present pairs, as listed. */
export const hazm = readFileSync(new URL("bench/data/raw/hazm-verbs.dat", root), "utf8").split("\n")
  .map((l) => l.trim()).filter((l) => l.includes("#") && !l.startsWith("#"))
  .map((l) => l.split("#") as [string, string]);
// Most frequent past stem first, so a shared present stem maps to it.
const byPresentFreq = hazm.slice().sort((a, b) => count(b[0]) - count(a[0]));
const pastOfPresent = new Map<string, string>();
for (const [past, present] of byPresentFreq) if (present && !pastOfPresent.has(present)) pastOfPresent.set(present, past);
export const droppedPasts: string[] = [];
/** The lexicon's verb pairs: attested, and not a frequent verb's present form. */
export const verbPairs = byPresentFreq.filter(([past, present]) => {
  // A real verb shows its infinitive or its present form in text (drops e.g. «تولید#تول», which reads «تولد» as a verb).
  // Affirmative forms only: «نوشت» (wrote) must not vouch for a verb «وشت».
  const seen = conjugate(past, present).filter((f) => !f.negative).reduce((n, f) => n + count(normalizeText(f.form, { hamzaYeh: true }).text), 0);
  if (seen < 20) { droppedPasts.push(`${past} (unattested)`); return false; }
  for (const end of ["ند", "د"]) {
    const other = past.endsWith(end) ? pastOfPresent.get(past.slice(0, -end.length)) : undefined;
    if (other && other !== past && count(other) > count(past)) { droppedPasts.push(`${past} (= ${past.slice(0, -end.length)}+${end}, ${other})`); return false; }
  }
  return true;
});
export const VERBS = verbPairs.map(([p, s]) => `${p}#${s}`).join(" ");

/** Each bare word's (no ZWNJ) most frequent spelling, the canonical one: the term of a lemma is fa-full's term for it. */
const best = new Map<string, string>();
for (const [w, n] of vocab) {
  const b = w.replaceAll(ZWNJ, "");
  const cur = best.get(b);
  if (cur === undefined || n > count(cur)) best.set(b, w);
}
export const spellingOf = (b: string) => best.get(b) ?? b;
