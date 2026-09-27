/**
 * fa-search-kit/minisearch: tokenize and processTerm for MiniSearch.
 *
 *     import MiniSearch from "minisearch";
 *     import { faMiniSearch } from "fa-search-kit/minisearch";
 *     const ms = new MiniSearch({ fields: ["title", "body"], ...faMiniSearch() });
 *
 * Documents are analyzed in index mode, queries (`searchOptions`, also used by
 * `autoSuggest`) in query mode. A `searchOptions` passed to MiniSearch after the
 * spread replaces this one: merge them, `{ ...fa.searchOptions, boost: { title: 2 } }`.
 */
import { adapterAnalyzer, queryTerms, type AdapterOptions } from "./shared.ts";

export interface MiniSearchAdapterOptions extends AdapterOptions {
  /**
   * MiniSearch's `combineWith`, if you set it: with "AND" every query word must
   * match, so verbs default to "lemma" (another tense still finds the page); with
   * "OR" (MiniSearch's default) to "stem" (H10).
   */
  combineWith?: "OR" | "AND";
}

export interface MiniSearchAdapter {
  tokenize(text: string): string[];
  processTerm(term: string): string;
  searchOptions: { tokenize(text: string): string[]; processTerm(term: string): string; combineWith?: "OR" | "AND" };
}

const identity = (term: string) => term;

export function faMiniSearch(options: MiniSearchAdapterOptions = {}): MiniSearchAdapter {
  const { combineWith, ...rest } = options;
  const analyzer = adapterAnalyzer(rest, combineWith === "AND" ? "lemma" : "stem");
  return {
    tokenize: (text) => analyzer.analyze(text, { mode: "index" }),
    processTerm: identity,
    searchOptions: {
      tokenize: (text) => queryTerms(analyzer, text),
      processTerm: identity,
      ...(combineWith ? { combineWith } : {}),
    },
  };
}
