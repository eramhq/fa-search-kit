/**
 * Shared by report.ts and compare.ts: load queries of one split and the cached
 * runs that answered exactly those queries.
 */
import { existsSync, readFileSync } from "node:fs";
import { type CorpusName } from "../corpus.ts";
import { loadQueries, type Query } from "../queries.ts";
import { loadSet } from "./rescue-sets.ts";
import { queryHash, runFile, type Run } from "../run.ts";
import { inSplit, splitOf, type Split } from "./split.ts";

/** Queries of a corpus in a split. Supplementary targets' canonical queries are dropped (they only feed rare rows). */
export function splitQueries(corpus: CorpusName, split: Split): Query[] {
  return loadQueries(corpus).filter((q) => inSplit(q.base, split) && !(q.type === "canonical" && q.supplement));
}

export interface LoadedRun {
  run: Run;
  rank: Map<string, number>;
  /** Rescue configs: the query searched instead of each query ("" = as typed), and the word bytes it needed. */
  fixed?: Map<string, string>;
  bytes?: Map<string, number>;
  /** The suggestion offered ("" = none) and the target's rank in its results. */
  suggested?: Map<string, string>;
  suggestedRank?: Map<string, number>;
}

const warned = new Set<string>();

/**
 * A run, or null when it is missing or answered another query set (stale after
 * regenerating queries). A full run serves every split; a dev-only run (experiment
 * arms) serves the dev split only.
 */
export function loadRun(corpus: CorpusName, engine: string, config: string, split: Split = "all", set = ""): LoadedRun | null {
  const all = set ? loadSet(corpus, set) : loadQueries(corpus);
  const full = runFile(corpus, engine, config, "all", set);
  const dev = runFile(corpus, engine, config, "dev", set);
  const [file, expected] = existsSync(full) ? [full, all]
    : split === "dev" && existsSync(dev) ? [dev, all.filter((q) => splitOf(q.base) === "dev")] : [null, all];
  if (!file) return null;
  const run = JSON.parse(readFileSync(file, "utf8")) as Run;
  if (run.queryHash !== queryHash(expected)) {
    const key = `${corpus}.${engine}.${config}${set ? `.${set}` : ""}`;
    if (!warned.has(key)) { warned.add(key); console.warn(`skipping stale run ${key} (query set changed)`); }
    return null;
  }
  return {
    run, rank: new Map(run.ids.map((id, i) => [id, run.ranks[i]!])),
    ...(run.fixed ? { fixed: new Map(run.ids.map((id, i) => [id, run.fixed![i]!])), bytes: new Map(run.ids.map((id, i) => [id, run.bytes![i]!])) } : {}),
    ...(run.suggested ? { suggested: new Map(run.ids.map((id, i) => [id, run.suggested![i]!])), suggestedRank: new Map(run.ids.map((id, i) => [id, run.suggestedRanks![i]!])) } : {}),
  };
}

export const VERB_TYPES = new Set(["verb-tense", "verb-negation", "verb-tense-ud"]);

/** Mean over lemmas of each lemma's mean: one frequent verb (شد) cannot carry the row. */
export function macroByLemma(queries: Query[], value: (q: Query) => number): { mean: number; lemmas: number } {
  const by = new Map<string, number[]>();
  for (const q of queries) {
    const k = q.lemma ?? "?";
    by.set(k, [...(by.get(k) ?? []), value(q)]);
  }
  const means = [...by.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  return { mean: means.length ? means.reduce((a, b) => a + b, 0) / means.length : 0, lemmas: by.size };
}

export const ORAMA_NOTE =
  "Orama with a whitespace tokenizer has a known ranking quirk (a common word can outscore a rare one; bench/results/README.md): read its cells with care.";
