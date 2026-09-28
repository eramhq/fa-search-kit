/**
 * Paice's conflation indices against UD gold lemmas (bench/conflation.ts), as a
 * library: Phase 4b picks the lemma model's threshold with them.
 */
import { label } from "./lemma.ts";
import { isWord, loadTreebank, type Treebank } from "./ud.ts";

export interface Entry { form: string; lemma: string; upos: string; freq: number }

/**
 * Gold lemmas, or "verb families": PerDT and Seraji give an infinitive («کردن») and
 * a participle used as an adjective («کرده») lemmas of their own, apart from the
 * verb («کرد»). Search wants them together (a searcher's «کردن» should find «کرد»),
 * so the second view folds a lemma into its verb when it is the verb's lemma + ن or + ه.
 */
export function entries(bank: Treebank, families: boolean, splits: readonly string[] = ["train", "dev", "test"]): Entry[] {
  const list = rawEntries(bank, splits);
  if (!families) return list;
  const verbs = new Set(list.filter((e) => e.upos === "VERB").map((e) => e.lemma));
  const by = new Map<string, Entry>();
  for (const e of list) {
    const lemma = /[نه]$/.test(e.lemma) && verbs.has(e.lemma.slice(0, -1)) ? e.lemma.slice(0, -1) : e.lemma;
    const key = `${e.form}\t${lemma}`;
    const x = by.get(key);
    if (x) x.freq += e.freq;
    else by.set(key, { ...e, lemma });
  }
  return [...by.values()];
}

function rawEntries(bank: Treebank, splits: readonly string[]): Entry[] {
  const by = new Map<string, Entry>();
  for (const s of loadTreebank(bank, splits)) {
    for (const w of s.words) {
      if (!isWord(w) || !w.lemma) continue;
      const lemma = label(w.lemma);
      const key = `${w.form}\t${lemma}`;
      const e = by.get(key);
      if (e) e.freq++;
      else by.set(key, { form: w.form, lemma, upos: w.upos, freq: 1 });
    }
  }
  return [...by.values()];
}

export interface Scores {
  ui: number; oi: number; umt: number; dmt: number; wmt: number; dnt: number;
  byPos: Record<string, { umt: number; dmt: number }>;
  merges: Map<string, Entry[]>;
}

const pairs = (n: number) => (n * (n - 1)) / 2;

export function score(list: Entry[], term: (f: string) => string): Scores {
  const terms = new Map<Entry, string>();
  for (const e of list) terms.set(e, term(e.form));
  // Under-stemming: within a lemma, pairs of forms whose terms differ.
  const byLemma = new Map<string, Entry[]>();
  for (const e of list) byLemma.set(e.lemma, [...(byLemma.get(e.lemma) ?? []), e]);
  let umt = 0, dmt = 0;
  const byPos: Scores["byPos"] = {};
  for (const group of byLemma.values()) {
    const counts = new Map<string, number>();
    for (const e of group) counts.set(terms.get(e)!, (counts.get(terms.get(e)!) ?? 0) + 1);
    const all = pairs(group.length);
    const same = [...counts.values()].reduce((s, n) => s + pairs(n), 0);
    umt += all - same;
    dmt += all;
    const pos = (byPos[group[0]!.upos] ??= { umt: 0, dmt: 0 });
    pos.umt += all - same;
    pos.dmt += all;
  }
  // Over-stemming: within a term, pairs with different lemmas and different forms.
  const byTerm = new Map<string, Entry[]>();
  for (const e of list) byTerm.set(terms.get(e)!, [...(byTerm.get(terms.get(e)!) ?? []), e]);
  let wmt = 0;
  const merges = new Map<string, Entry[]>();
  for (const [t, group] of byTerm) {
    if (group.length < 2) continue;
    const lemmas = new Map<string, number>(), forms = new Map<string, number>();
    for (const e of group) {
      lemmas.set(e.lemma, (lemmas.get(e.lemma) ?? 0) + 1);
      forms.set(e.form, (forms.get(e.form) ?? 0) + 1);
    }
    // All pairs − same-lemma pairs − same-form pairs (+ same both = 0: entries are distinct pairs).
    const w = pairs(group.length) - [...lemmas.values()].reduce((s, n) => s + pairs(n), 0) - [...forms.values()].reduce((s, n) => s + pairs(n), 0);
    if (w > 0) { wmt += w; merges.set(t, group); }
  }
  const total = list.length;
  const dnt = [...byLemma.values()].reduce((s, g) => s + g.length * (total - g.length), 0) / 2;
  return { ui: umt / dmt, oi: wmt / dnt, umt, dmt, wmt, dnt, byPos, merges };
}

