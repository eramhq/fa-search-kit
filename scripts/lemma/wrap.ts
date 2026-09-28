/**
 * A lexicon with a lemma model behind it (Phase 4b). The base lexicon always wins;
 * the model only answers for words the base leaves to the rules, and never calls
 * Snowball: when it defers, the analyzer's output is exactly the base's.
 *
 * - terms.get(w) = base.terms.get(w) ?? nominal(w); terms.has stays the base's
 *   (the stemmer's plural rule asks it about a word's stem). Never for a PROTECTED
 *   word or one the base reads as a verb;
 * - verb(w, k) = base.verb(w, k) ?? verbal(w, k), so the verb channel runs only
 *   where the analyzer uses verb lemmas (H10).
 *
 * Moves to src/lemma/ if Phase 4b ships.
 */
import type { Lexicon } from "../../src/stem.ts";
import { PROTECTED } from "../../src/words.ts";
import { applyEdit, type Edit } from "./edit.ts";

export interface Prediction { edit: Edit; conf: number }
export type Predictor = (word: string) => Prediction | undefined;

class Terms extends Map<string, string> {
  readonly base: Map<string, string>;
  readonly nominal: (w: string) => string | undefined;
  constructor(base: Map<string, string>, nominal: (w: string) => string | undefined) {
    super();
    this.base = base;
    this.nominal = nominal;
  }
  override get(w: string) { return this.base.get(w) ?? this.nominal(w); }
  override has(w: string) { return this.base.has(w); }
}

export function createLemmaLexicon(base: Lexicon, predict: Predictor, tau = 0): Lexicon {
  // One prediction per distinct word: the stemmer asks terms, then verb, for the same word.
  let lastWord = "", last: Prediction | undefined;
  const ask = (w: string) => {
    if (w !== lastWord) { lastWord = w; last = predict(w); }
    return last && last.conf >= tau ? last.edit : undefined;
  };
  const nominal = (w: string) => {
    // A word the base reads as a verb stays a verb, whichever verb setting the analyzer uses.
    if (PROTECTED.has(w) || base.verb(w, true) !== undefined) return undefined;
    const e = ask(w);
    return e && !e.verb ? applyEdit(w, e, true) : undefined;
  };
  const verbal = (w: string, keepNegation: boolean) => {
    const e = ask(w);
    return e?.verb ? applyEdit(w, e, keepNegation) : undefined;
  };
  return {
    terms: new Terms(base.terms, nominal),
    verb: (w, k) => base.verb(w, k) ?? verbal(w, k),
  };
}
