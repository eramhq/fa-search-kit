/**
 * Clean training pairs for the lemma model (label source M), mined from Hazm's
 * verb list (MIT) and our vocabulary counts only (scripts/lib/mine.ts).
 *
 * - Verbs: every Hazm pair conjugated (bench/lib/verbs.ts), plus the perfect
 *   («رفته‌اند»). Keep forms seen ≥ 5 times, of verbs used ≥ 5 times in all; drop
 *   forms two verbs share, forms that take a plural (nouns), and unprefixed forms
 *   whose stem is itself a noun («کارم»: کار is "work" before it is کاشتن's stem).
 *   Label (ن)+past; not residual, so the regular patterns carry to verbs the
 *   lexicon lacks.
 * - Nominals (distant supervision): X+σ → X for the endings below, positive when
 *   both are attested, X is seen ≥ 20 times, and X+σ is not a word of its own (takes
 *   no plural, no derivative). One-letter endings after a consonant (ی, م, ت, ش) also
 *   need count(X+σ) ≤ ρ·count(X), the others ≤ ρ'·count(X); ی after ا/و is always
 *   ezafe. A comparative needs the other degree attested (سخت‌تر and سخت‌ترین; not
 *   «والتر»), and X of 3+ letters, not a stop word (بهتر ↛ به). Target: fa-full's term
 *   for X; the label defers where fa-full already gives it for every spelling (residual).
 * - Negatives (defer): each X, and words that only look like X+σ: they take a plural
 *   or a nisba ی of their own (ماهی, مهمان, کرمان), or are spelled as a compound.
 * - Unsure (not labels; the LLM labellers' queue): candidates failing a count test,
 *   every clitic and ین candidate (the rules handle clitics; mined ones are mostly
 *   names: «ایشان», «آیدین»).
 */
import { readFileSync } from "node:fs";
import { conjugate } from "../../bench/lib/verbs.ts";
import { normalizeText } from "../../src/normalize.ts";
import { lexicon } from "../../src/lexicon/index.ts";
import { lemmaTerm, refTerm } from "../../bench/lib/lemma.ts";
import { count, hazm, pluralizable, vocab, ZWNJ } from "../lib/mine.ts";

export interface Pair {
  /** Bare word (no ZWNJ): the model's input. */
  word: string;
  /** Its term, or "" to defer. */
  target: string;
  verb: boolean;
  neg: boolean;
  /** Ending class, for reports and per-class checks. */
  cls: string;
  /** The lemma, for the split (verbs: past stem; nominals: X; negatives: the word). */
  lemma: string;
  count: number;
  /** Mined but not decided (the ratio or degree test failed): a candidate for the LLM labellers, not a label. */
  unsure?: true;
}

const bare = (w: string) => w.replaceAll(ZWNJ, "");
const norm = (w: string) => normalizeText(w, { hamzaYeh: true }).text;

/** Counts by bare spelling, and each bare word's attested spellings. */
export const bareCount = new Map<string, number>();
export const spellings = new Map<string, string[]>();
for (const [w, n] of vocab) {
  const b = bare(w);
  bareCount.set(b, (bareCount.get(b) ?? 0) + n);
  spellings.set(b, [...(spellings.get(b) ?? []), w]);
}
export const bc = (b: string) => bareCount.get(b) ?? 0;


const stop = new Set(readFileSync(new URL("../../bench/data/raw/hazm-stopwords.dat", import.meta.url), "utf8").split("\n").map((s) => bare(norm(s.trim()))).filter(Boolean));

/** Takes a plural or a derivative itself, in any spelling: a word, not X + suffix. */
function ownWord(b: string): boolean {
  if ((spellings.get(b) ?? [b]).some((w) => pluralizable(w))) return true;
  return ["ها", "های", "ان", "ت", "تر", "ترین", "یت"].some((s) => bc(b + s) >= 3);
}

// --- verbs ---------------------------------------------------------------------------

const PERFECT = ["ام", "ای", "است", "ایم", "اید", "اند"];

export function verbPairs(): Pair[] {
  const byForm = new Map<string, Map<string, { neg: boolean; past: string; prefixed: boolean; stem: string }>>();
  for (const [past, present] of hazm) {
    const forms = conjugate(past, present).map((f) => ({ form: f.form, neg: f.negative, stem: f.tense === "presProg" || f.tense === "subj" ? present : past }));
    // The perfect: participle + person ending («رفته‌اند»), negative too.
    for (const neg of [false, true]) for (const p of PERFECT) forms.push({ form: conjugate(past, present).find((f) => f.tense === "participle" && f.negative === neg)!.form + ZWNJ + p, neg, stem: past });
    const total = forms.filter((f) => !f.neg).reduce((s, f) => s + bc(bare(norm(f.form))), 0);
    if (total < 5) continue;
    for (const f of forms) {
      // The copula's «است» takes only ن («نیست»): «بیستم» is twentieth (as in the lexicon).
      if (f.stem === "است" && !f.neg) continue;
      const b = bare(norm(f.form));
      const m = byForm.get(b) ?? new Map();
      const target = (f.neg ? "ن" : "") + norm(past);
      m.set(target, { neg: f.neg, past: norm(past), prefixed: /^(?:ن?می|ب|ن)/.test(norm(f.form)) && !b.startsWith(norm(f.stem)), stem: norm(f.stem) });
      byForm.set(b, m);
    }
  }
  const out: Pair[] = [];
  for (const [word, m] of byForm) {
    const n = bc(word);
    if (n < 5 || m.size !== 1) continue; // unattested, or two verbs share it
    const [target, v] = [...m][0]!;
    if (ownWord(word)) continue; // a noun («برند», «نبرد»)
    if (!v.prefixed && ownWord(v.stem)) continue; // «کارم»: کار is a noun
    out.push({ word, target, verb: true, neg: v.neg, cls: "verb", lemma: v.past, count: n });
  }
  return out;
}

// --- nominals ------------------------------------------------------------------------

/** Ending → class. No ت clitic: "your" is rare in text and many words end in ت (as in the core). */
const ENDINGS: [string, string][] = [
  ["هایی", "ها"], ["های", "ها"], ["ها", "ها"],
  ["یان", "ان"], ["ان", "ان"], ["ین", "ین"], ["ات", "ات"],
  ["یی", "ezafe"], ["ای", "ezafe"], ["ی", "ezafe"],
  ["مان", "clitic"], ["تان", "clitic"], ["شان", "clitic"], ["م", "clitic"], ["ش", "clitic"],
  ["ترین", "comparative"], ["تر", "comparative"],
];

export interface NominalOptions {
  /** One-letter endings after a consonant (ی, م, ش): count(X+σ) ≤ rho · count(X). */
  rho: number;
  /** Plurals (ان, ات, گان, ین), comparatives, joined مان/تان/شان: count(X+σ) ≤ rhoPlural · count(X). */
  rhoPlural: number;
  minBase: number;
  minForm: number;
}
export const DEFAULTS: NominalOptions = { rho: 0.5, rhoPlural: 2, minBase: 20, minForm: 5 };

interface Cand { X: string; cls: string; stem: string; s: string }

export function nominalPairs(o: NominalOptions = DEFAULTS): Pair[] {
  const cands = new Map<string, Cand[]>();
  const add = (F: string, c: Cand) => cands.set(F, [...(cands.get(F) ?? []), c]);
  for (const [X, nx] of bareCount) {
    if (nx < o.minBase || X.length < 2 || !/^[\u0620-\u06FF]+$/.test(X)) continue;
    for (const [s, cls] of ENDINGS) {
      if (cls === "comparative" && (X.length <= 2 || stop.has(X))) continue;
      if ((cls === "ان" || cls === "ین" || cls === "ات") && X.length < 3) continue;
      add(X + s, { X, cls, stem: X, s });
      // حمله → حملات, نویسنده → نویسندگان.
      if (X.endsWith("ه") && X.length >= 4 && (s === "ات" || s === "ان")) {
        const t = s === "ان" ? "گان" : "ات";
        add(X.slice(0, -1) + t, { X, cls: t, stem: X.slice(0, -1), s: t });
      }
    }
  }
  const out: Pair[] = [];
  const lemmas = new Set<string>();
  for (const [F, list] of cands) {
    const nf = bc(F);
    if (nf < o.minForm) continue;
    // Two different bases («کتابی» from کتاب; «کتابان»…): keep the most frequent, if it dominates;
    // but «نوای» is نوا + ی before it is نو + ای.
    const byBase = list.slice().sort((a, b) => bc(b.X) - bc(a.X));
    const alef = byBase.find((c) => c.s === "ی" && c.X.endsWith("ا") && byBase.some((d) => d.s === "ای" && d.X + "ا" === c.X));
    if (alef) byBase.splice(0, byBase.length, alef);
    const { X, stem, s } = byBase[0]!;
    // ezafe/indefinite ی by what precedes it: a vowel (ابتدای, رادیویی: always ezafe), ه (خانه‌ای), a consonant (risky: تعدادی, علمی).
    // After a vowel, «یی» is mostly the abstract/nisba suffix (رهایی, بینایی), not ezafe.
    const cls = byBase[0]!.cls !== "ezafe" ? byBase[0]!.cls : /[او]$/.test(X) ? (s === "یی" ? "یی after vowel" : "ezafe after vowel") : X.endsWith("ه") ? "ezafe after ه" : "ezafe after consonant";
    if (byBase.length > 1 && byBase[1]!.X !== X && bc(byBase[1]!.X) > 0.2 * bc(X)) continue;
    const nx = bc(X);
    // A half-space anywhere but at the X|σ boundary or inside X's own spellings: a compound («کم‌کم»).
    const xs = [X, ...(spellings.get(X) ?? [])];
    const compound = (spellings.get(F) ?? []).some((w) => {
      if (!w.includes(ZWNJ)) return false;
      const b = w.endsWith(ZWNJ + s) ? w.slice(0, -s.length - 1) : w.endsWith(s) ? w.slice(0, -s.length) : null;
      return b === null || !xs.some((x) => x.startsWith(b));
    });
    const oneLetter = s.length === 1 && cls !== "ها";
    const afterVowel = cls === "ezafe after vowel";
    const ratio = cls === "ها" || afterVowel ? Infinity : oneLetter ? o.rho : o.rhoPlural;
    const otherDegree = cls !== "comparative" || bc(stem + (s === "تر" ? "ترین" : "تر")) >= 3;
    // A name or a word of its own takes a nisba ی often («کرمانی», «لبنانی»); a plural rarely («بیمارانی»).
    const nisba = !cls.startsWith("ezafe") && cls !== "ها" && bc(F + "ی") > 0.2 * nf;
    if (ownWord(F) || compound || nisba) {
      // Hard negative: a word of its own that looks like X + σ.
      out.push({ word: F, target: "", verb: false, neg: false, cls: `lookalike ${cls}`, lemma: F, count: nf });
      continue;
    }
    if (lexicon.verb(F, true) !== undefined || lexicon.terms.has(F)) continue; // the lexicon decides these
    const target = refTerm(X);
    // Clitics are the rules' job (a residual clitic label is nearly always a name or a word: «ایشان», «هرمان»);
    // the ین plural is rare and mostly mimicked by names and Arabic words («آیدین», «مسلمین»).
    if (nf > ratio * nx || !otherDegree || cls === "clitic" || cls === "ین") {
      // Neither side is clear: left to the LLM labellers.
      out.push({ word: F, target, verb: false, neg: false, cls: `unsure ${cls}`, lemma: X, count: nf, unsure: true });
      continue;
    }
    // Residual: defer where fa-full already gives the target for every spelling.
    const done = (spellings.get(F) ?? [F]).every((w) => refTerm(w) === target);
    out.push({ word: F, target: done ? "" : target, verb: false, neg: false, cls, lemma: X, count: nf });
    lemmas.add(X);
  }
  // Negatives: the bases themselves.
  const seen = new Set(out.map((p) => p.word));
  for (const X of lemmas) if (!seen.has(X)) out.push({ word: X, target: "", verb: false, neg: false, cls: "lemma", lemma: X, count: bc(X) });
  return out;
}
