/**
 * Training and evaluation examples for the lemma models: one per bare word, with
 * its label (an edit or DEFER) and a weight log2(1 + count).
 *
 * Label sources (bench/results/experiments.md, "Phase 4b"):
 * - M: mined (bench/data/lemma/mined.jsonl; classes that passed the UD bar);
 * - L: LLM labels both families agree on; a disagreement defers;
 * - M+L: both, the LLM label winning where it has one (it audits the miner);
 * - U: UD gold, train files only (comparison, never shipped);
 * - H: Hazm's lemmatizer over the same words (comparison, never shipped).
 * Split by lemma (bench/lib/lemma.ts): training uses train lemmas only.
 */
import { existsSync, readFileSync } from "node:fs";
import { lemmaSplit, udExamples, type LemmaSplit } from "../../bench/lib/lemma.ts";
import { DEFER, encodeEdit, editKey } from "./edit.ts";
import { count, vocab } from "../lib/mine.ts";

export { DEFER } from "./edit.ts";

export interface Example {
  word: string;
  /** editKey, or DEFER. */
  label: string;
  weight: number;
  count: number;
  split: LemmaSplit;
  cls: string;
  /** A verb label's past stem (its lemma), for the held-out arms. */
  verbLemma?: string;
}

export interface Labelled { word: string; target: string; verb: boolean; neg: boolean; lemma: string; count: number; cls: string; unsure?: boolean }

const LEMMA_DIR = new URL("../../bench/data/lemma/", import.meta.url);

export function toExample(p: Labelled): Example | undefined {
  let label = DEFER;
  if (p.target) {
    const e = encodeEdit(p.word, p.target, p.verb, p.neg);
    if (!e) return undefined;
    label = editKey(e);
  }
  return { word: p.word, label, weight: Math.log2(1 + p.count), count: p.count, split: lemmaSplit(p.lemma), cls: p.cls, ...(p.verb ? { verbLemma: p.lemma } : {}) };
}

export function mined(): Labelled[] {
  return readFileSync(new URL("mined.jsonl", LEMMA_DIR), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Labelled).filter((p) => !p.unsure);
}

/**
 * Accepted LLM labels (bench/lemma-llm.ts --merge), without the classes that failed the UD
 * bar; `readmit` lets named dropped classes back in (the ezafe ی arm, after adjudication).
 */
export function llm(readmit: string[] = []): Labelled[] {
  const f = new URL("llm/labels.jsonl", LEMMA_DIR);
  return existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Labelled & { dropped?: boolean }).filter((p) => !p.dropped || readmit.includes(p.cls)) : [];
}
/** The ezafe ی classes: under the UD bar (94.0%, 92.3%), ~99% after reading the disagreements (experiments.md). */
export const EZAFE = ["ezafe after consonant", "ezafe after vowel"];

/** UD train files: each word's dominant target (≥ 90% of its uses); defer where fa-full already gives it. */
export function ud(): Labelled[] {
  const by = new Map<string, Map<string, { n: number; e: ReturnType<typeof udExamples>[number] }>>();
  for (const e of udExamples(["train"])) {
    const m = by.get(e.word) ?? new Map();
    const k = `${e.verb}|${e.neg}|${e.target}`;
    const x = m.get(k) ?? { n: 0, e };
    x.n += e.count;
    m.set(k, x);
    by.set(e.word, m);
  }
  const out: Labelled[] = [];
  for (const [word, m] of by) {
    const all = [...m.values()].sort((a, b) => b.n - a.n);
    const total = all.reduce((s, x) => s + x.n, 0);
    const { e } = all[0]!;
    const agreed = all[0]!.n >= 0.9 * total;
    out.push({ word, target: agreed && e.target !== e.base ? e.target : "", verb: e.verb, neg: e.neg, lemma: e.lemma, count: total, cls: `ud ${e.upos}` });
  }
  return out;
}

export type Source = "M" | "L" | "M+L" | "M+L+ez" | "U" | "H";

export function labels(source: Source): Labelled[] {
  if (source === "M") return mined();
  if (source === "L") return llm();
  if (source === "U") return ud();
  if (source === "H") {
    const f = new URL("hazm.jsonl", LEMMA_DIR);
    return readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Labelled);
  }
  const l = llm(source === "M+L+ez" ? EZAFE : []);
  const have = new Set(l.map((p) => p.word));
  return [...mined().filter((p) => !have.has(p.word)), ...l];
}

const STOP = new Set(readFileSync(new URL("raw/hazm-stopwords.dat", LEMMA_DIR.href.replace(/lemma\/$/, "")), "utf8").split("\n").map((w) => w.trim().replaceAll("\u200C", "")).filter(Boolean));
const spellingsOf = new Map<string, [string, number][]>();
for (const [w, n] of vocab) {
  const b = w.replaceAll("\u200C", "");
  if (b !== w) spellingsOf.set(b, [...(spellingsOf.get(b) ?? []), [w, n]]);
}

/**
 * Merges the lookup cannot hold safely (found reviewing the list's added merges, CP5):
 * - a stop word («آنها» → آن: "they" is not "that");
 * - a bare word whose half-space spelling splits it after the lemma («نامه‌ای» for the key
 *   «نامهای» labelled نام + های): the lexicon is keyed by the bare word, so one entry would
 *   serve both; or before it, when an ending follows the half-space («دست‌های» for «دستهای»
 *   labelled دسته + ای). Such a word is skipped when that spelling has ≥ 5% of its uses.
 */
const ENDING = /^(?:ها|های|هایی|ای|ی|ام|ات|اش|ایم|اید|اند|مان|تان|شان|هایم|هایت|هایش|هایمان|هایتان|هایشان|تر|ترین|ان|یان|گان|ین)$/;
export function unsafe(p: Labelled): boolean {
  if (!p.target) return false;
  if (STOP.has(p.word)) return true;
  if (p.verb) return false;
  const lemma = p.lemma.replaceAll("\u200C", "");
  const total = count(p.word) + (spellingsOf.get(p.word) ?? []).reduce((s, [, n]) => s + n, 0);
  return (spellingsOf.get(p.word) ?? []).some(([w, n]) => {
    const z = w.indexOf("\u200C");
    // Split elsewhere than the label, before a bare ending: another reading of the same letters.
    const other = z !== lemma.length && (z > lemma.length || ENDING.test(w.slice(z + 1).replaceAll("\u200C", "")));
    return other && n >= 0.05 * total;
  });
}

export function examples(source: Source): Example[] {
  const out: Example[] = [];
  for (const p of labels(source)) {
    if (unsafe(p)) continue;
    const e = toExample(p);
    if (e) out.push(e);
  }
  return out;
}
