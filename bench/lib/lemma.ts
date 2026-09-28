/**
 * Phase 4b (the lemma model): shared definitions for the tools that build, label
 * and evaluate it.
 *
 * - The **target** of a word is the term every form of its lexeme should get:
 *   verbs (ن)+past stem, the lexicon's term space; everything else the term fa-full
 *   gives the lemma's usual spelling, `lemmaTerm(lemma)`. Labels are residual: where fa-full already
 *   gives the target, the model should defer.
 * - **Splits** are by lemma, frozen before any labelling: a hash of the lemma puts
 *   10% in test, 10% in dev, the rest in train. A lemma's forms never straddle.
 * - UD examples (CC BY-SA, evaluation and comparison arms only): every word token
 *   with its gold lemma. Verb targets come from PerDT only (Seraji lemmatizes the
 *   passive «شد» as «کرد»); Seraji's verbs are left out. Function words (AUX, PRON,
 *   ADP…) keep fa-full's term as their target: the model must leave them alone, so
 *   they only count against it (false fires).
 */
import { createAnalyzer } from "../../src/analyzer.ts";
import { lexicon } from "../../src/lexicon/index.ts";
import type { Lexicon } from "../../src/stem.ts";
import { ZWNJ } from "../../src/normalize.ts";
import { spellingOf } from "../../scripts/lib/mine.ts";
import { standardTyping } from "./persian.ts";
import { seedOf } from "./rng.ts";
import { isWord, loadTreebank, TREEBANKS, type Treebank } from "./ud.ts";
import { ending } from "./lemma-sets.ts";
import { encodeEdit, type Edit } from "../../scripts/lemma/edit.ts";
import type { Predictor } from "../../scripts/lemma/wrap.ts";

/** fa-full's analyzer (full profile, verb lemmas, negation kept): the reference the labels are residual to. */
export const ref = createAnalyzer({ profile: "full", lexicon });
export const refTerm = (text: string) => ref.analyze(text, { mode: "query" }).join(" ");
/** The one normalized token the stemmer sees for a word, or undefined when it is not one token. */
export function tokenOf(form: string): string | undefined {
  const t = ref.tokens(form);
  return t.length === 1 ? t[0]!.text : undefined;
}
export const bare = (t: string) => t.replaceAll(ZWNJ, "");
/**
 * A lemma's term: fa-full's term for its most frequent spelling in the vocabulary,
 * so UD's spelling conventions («مجری» with alef maksura, «به‌جا») and the mined
 * pairs' agree.
 */
export function lemmaTerm(lemma: string): string {
  const b = bare(tokenOf(lemma) ?? lemma);
  return refTerm(spellingOf(b));
}

/**
 * Gold lemma labels carry spelling noise («برنامهٔ» and «برنامه», «زندگی‌», «اولِ»,
 * «رأی»/«رای») that would count as distinct lemmas. Fold it, with plain rules that
 * do not depend on the analyzers under test.
 */
export const label = (lemma: string) =>
  standardTyping(lemma).replace(/^‌+|‌+$/g, "").replaceAll("ۀ", "ه").replace(/[أإ]/g, "ا").replaceAll("ؤ", "و").replaceAll("ئ", "ی");

export type LemmaSplit = "train" | "dev" | "test";
/** By lemma: 10% test, 10% dev, 80% train. */
export function lemmaSplit(lemma: string): LemmaSplit {
  const h = seedOf(`lemma/${lemma}`) % 10;
  return h === 0 ? "test" : h === 1 ? "dev" : "train";
}

export interface UdExample {
  bank: Treebank;
  /** The UD file it came from. */
  udSplit: "train" | "dev" | "test";
  /** Normalized token (with its ZWNJ). */
  token: string;
  /** The token without ZWNJ: what the model sees. */
  word: string;
  /** Gold lemma, folded (`label`); verbs: preverb + past stem. */
  lemma: string;
  upos: string;
  verb: boolean;
  neg: boolean;
  /** The term this token should get (under kept negation). */
  target: string;
  /** fa-full's term for the token. */
  base: string;
  count: number;
}

const CONTENT = new Set(["NOUN", "ADJ", "VERB", "ADV", "PROPN"]);
const cache = new Map<string, UdExample[]>();

/** Distinct (token, lemma, UPOS, polarity) examples of the treebanks' word tokens, with counts. */
export function udExamples(splits: readonly ("train" | "dev" | "test")[] = ["train", "dev", "test"], banks: readonly Treebank[] = TREEBANKS): UdExample[] {
  const key = `${splits.join(",")}|${banks.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const by = new Map<string, UdExample>();
  const targets = new Map<string, string>();
  for (const bank of banks) {
    for (const udSplit of splits) {
      for (const s of loadTreebank(bank, [udSplit])) {
        for (const w of s.words) {
          if (!isWord(w) || !w.lemma) continue;
          const verb = w.upos === "VERB";
          if (verb && bank !== "perdt") continue;
          const token = tokenOf(w.form);
          if (!token || !/[ؠ-ۿ]/.test(token)) continue;
          const neg = verb && /Polarity=Neg/.test(w.feats);
          let lemma = label(w.lemma);
          if (verb) {
            // PerDT drops a preverb from the lemma but keeps it in OrigLemma («بر#خاست»).
            const orig = /(?:^|\|)OrigLemma=([^|]+)/.exec(w.misc)?.[1]?.split("#") ?? [];
            if (orig.length === 2 && orig[0] && orig[0] !== w.lemma && orig[1] === w.lemma) lemma = label(orig[0] + w.lemma);
            lemma = bare(tokenOf(lemma) ?? lemma);
          }
          const k = `${bank}\t${udSplit}\t${token}\t${lemma}\t${w.upos}\t${neg}`;
          const e = by.get(k);
          if (e) { e.count++; continue; }
          let target: string;
          if (!CONTENT.has(w.upos)) target = refTerm(token);
          else if (verb) target = (neg ? "ن" : "") + lemma;
          else {
            target = targets.get(lemma) ?? lemmaTerm(lemma);
            targets.set(lemma, target);
          }
          by.set(k, { bank, udSplit, token, word: bare(token), lemma, upos: w.upos, verb, neg, target, base: refTerm(token), count: 1 });
        }
      }
    }
  }
  const out = [...by.values()];
  cache.set(key, out);
  return out;
}

/** Why a form's term differs from its lemma's: the ending that separates them (verbs: in the lexicon or not). */
export function cause(e: Pick<UdExample, "word" | "lemma" | "verb">): string {
  if (e.verb) return lexicon.verb(e.word, true) !== undefined ? "verb, lexicon verb" : "verb, not in lexicon";
  return ending(e.word, bare(e.lemma));
}

/**
 * The UD oracle (upper bound, never shipped): each word's gold target when one
 * (target, kind) holds ≥ 90% of its uses in the given UD files.
 */
export function udOracle(splits: readonly ("train" | "dev" | "test")[] = ["train", "dev", "test"]): Predictor {
  const by = new Map<string, Map<string, { e: UdExample; n: number }>>();
  for (const e of udExamples(splits)) {
    const m = by.get(e.word) ?? new Map();
    const k = `${e.verb}|${e.neg}|${e.target}`;
    const x = m.get(k) ?? { e, n: 0 };
    x.n += e.count;
    m.set(k, x);
    by.set(e.word, m);
  }
  const table = new Map<string, Edit>();
  for (const [word, m] of by) {
    const all = [...m.values()];
    const total = all.reduce((s, x) => s + x.n, 0);
    const top = all.sort((a, b) => b.n - a.n)[0]!;
    if (top.n < 0.9 * total) continue;
    const edit = encodeEdit(word, top.e.target, top.e.verb, top.e.neg);
    if (edit) table.set(word, edit);
  }
  return (w) => { const edit = table.get(w); return edit ? { edit, conf: 1 } : undefined; };
}

/**
 * A lexicon's terms against the UD targets (content words; function words only
 * count against it): tokens fixed (fa-full missed, this hits) and broken (fa-full hit,
 * this misses), overall and per UPOS.
 */
export function udScore(lex: Lexicon, splits: readonly ("train" | "dev" | "test")[] = ["dev"]) {
  const a = createAnalyzer({ profile: "full", lexicon: lex });
  const out = { tokens: 0, miss: 0, hit: 0, fixed: 0, broken: 0, byPos: {} as Record<string, { fixed: number; broken: number; miss: number; hit: number }> };
  for (const e of udExamples(splits)) {
    const t = a.analyze(e.token, { mode: "query" }).join(" ");
    const b = e.base === e.target, m = t === e.target;
    const p = (out.byPos[e.upos] ??= { fixed: 0, broken: 0, miss: 0, hit: 0 });
    out.tokens += e.count;
    if (b) { out.hit += e.count; p.hit += e.count; } else { out.miss += e.count; p.miss += e.count; }
    if (!b && m) { out.fixed += e.count; p.fixed += e.count; }
    if (b && !m) { out.broken += e.count; p.broken += e.count; }
  }
  return out;
}
