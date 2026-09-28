/**
 * fa-search-kit/analytics: one key per query meaning, for search logs.
 *
 *     canonicalKey("كتاب") === canonicalKey("کتاب") === canonicalKey("کتابها")   // "1:کتاب"
 *
 * The key is the query's analyzed terms, each once, sorted, after a version prefix.
 * Keys depend on the analyzer (profile, lexicon, options) and on the package version:
 * when either changes, the prefix tells a stats table which rows to regroup. Pass the
 * site's analyzer (and your own prefix) to group as the search does; to group the
 * query a rescue actually searched, key `fix.to` (fa-search-kit/rescue).
 */
import { createAnalyzer, type Analyzer } from "./analyzer.ts";

/** Bumped whenever a release changes the terms some query gets. */
export const KEY_VERSION = "1";

let standard: Analyzer | undefined;

export function canonicalKey(query: string, options: { analyzer?: Analyzer; prefix?: string } = {}): string {
  const analyzer = options.analyzer ?? (standard ??= createAnalyzer());
  const terms = [...new Set(analyzer.analyze(query, { mode: "query" }))].sort();
  return `${options.prefix ?? KEY_VERSION}:${terms.join(" ")}`;
}
