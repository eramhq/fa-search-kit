/**
 * Shared by the engine adapters: one analyzer per adapter instance, built from
 * the same options at index time and query time.
 */
import { createAnalyzer, type Analyzer, type AnalyzerOptions } from "../analyzer.ts";

export interface AdapterOptions extends AnalyzerOptions {
  /**
   * An analyzer to use as is (its options are then ignored). Share one between the
   * code that builds an index and the code that queries it, or pass the same options to both.
   */
  analyzer?: Analyzer;
}

/**
 * The adapter's analyzer. The profile defaults to "full" when a lexicon is passed,
 * else "standard". `verbs` (full profile) defaults per engine (H10,
 * bench/results/experiments.md): "lemma" where every query word must match
 * (Pagefind, FlexSearch, MiniSearch with AND), "stem" where any word may.
 */
export function adapterAnalyzer(options: AdapterOptions, verbs: "lemma" | "stem"): Analyzer {
  if (options.analyzer) return options.analyzer;
  return createAnalyzer({ profile: options.lexicon ? "full" : "standard", verbs, ...options });
}

/** Query terms, each once: Orama's threshold and OR engines' scores count a repeated term twice. */
export const queryTerms = (analyzer: Analyzer, text: string): string[] => [...new Set(analyzer.analyze(text, { mode: "query" }))];
