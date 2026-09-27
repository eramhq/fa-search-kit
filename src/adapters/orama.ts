/**
 * fa-search-kit/orama: a tokenizer for Orama.
 *
 *     import { create } from "@orama/orama";
 *     import { faTokenizer } from "fa-search-kit/orama";
 *     const db = create({ schema: { title: "string" }, components: { tokenizer: faTokenizer() } });
 *
 * Orama calls the tokenizer with the property name when it indexes and without
 * one when it searches, so documents get index mode and queries query mode.
 *
 * Orama looks every query term up as a prefix and adds up the scores of every
 * indexed word it prefixes (3.1.18, `exact: false`, the default; `exact: true`
 * filters with a JS `\b` regex that never matches between Persian letters). So a
 * short term such as «کتاب» would also score every page with «کتابخانه». With
 * `exactTerms` (default) every term ends with a sentinel, so a term is only a
 * prefix of itself. Typo tolerance (`tolerance`) still works on top.
 */
import { adapterAnalyzer, queryTerms, type AdapterOptions } from "./shared.ts";

export interface OramaTokenizerOptions extends AdapterOptions {
  /** End every term with a sentinel so Orama's prefix lookup matches whole terms only (default true). */
  exactTerms?: boolean;
}

/** Orama's `Tokenizer` shape (components.tokenizer), without importing Orama. */
export interface OramaTokenizer {
  language: string;
  normalizationCache: Map<string, string>;
  tokenize(raw: string, language?: string, prop?: string, withCache?: boolean): string[];
}

/** Never produced by the analyzer (its words are letters, digits and marks). */
const SENTINEL = "_";

/** Verbs default to "stem": Orama matches any query word (H10). */
export function faTokenizer(options: OramaTokenizerOptions = {}): OramaTokenizer {
  const analyzer = adapterAnalyzer(options, "stem");
  const end = options.exactTerms === false ? "" : SENTINEL;
  return {
    language: "persian",
    normalizationCache: new Map(),
    tokenize(raw, _language, prop) {
      const terms = prop === undefined ? queryTerms(analyzer, raw) : analyzer.analyze(raw, { mode: "index" });
      return end ? terms.map((t) => t + end) : terms;
    },
  };
}
