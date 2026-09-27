/**
 * fa-search-kit/pagefind: the query side of Persian for Pagefind (browser).
 *
 * The index side (fa-search-kit/pagefind/build, or the CLI) keeps each page's own
 * text and adds a hidden block with the analyzer's index terms. Here the same
 * analyzer runs in query mode:
 *
 *     const fa = faPagefind();
 *     new PagefindUI({ element: "#search", processTerm: fa.processTerm, processResult: fa.processResult });
 *     // or with the JS API:
 *     const search = await pagefind.search(fa.processQuery(input));
 *     const data = fa.processResult(await search.results[0].data(), input);
 *
 * Pass the same options as at build time (profile, lexicon, verbs).
 *
 * Pagefind shows hidden text in excerpts like any other, so an excerpt can land on
 * the block of terms instead of the page's words. The block is wrapped in ⁅…⁆
 * (kept in Pagefind's `content`, never searchable), and `processResult` rebuilds
 * the excerpt from the page's visible text, marking the words whose terms match
 * the query.
 */
import { adapterAnalyzer, queryTerms, type AdapterOptions } from "./shared.ts";

/** The fields of a Pagefind result's `data()` that `processResult` reads and rewrites. */
export interface PagefindResultData {
  content: string;
  excerpt: string;
  meta?: Record<string, string>;
  sub_results?: { excerpt: string }[];
}

export interface PagefindAdapter {
  /** For Pagefind UI's `processTerm` option. Remembers the query for `processResult`. */
  processTerm(term: string): string;
  /**
   * For Pagefind UI's `processResult` option: the excerpt of an annotated page is
   * rebuilt from its visible text, and its own title restored (see the `title` option of
   * fa-search-kit/pagefind/build). `query` defaults to the last one `processTerm` saw.
   */
  processResult<R extends PagefindResultData>(result: R, query?: string): R;
  /** An excerpt of about `words` words of `content`'s visible text around the best cluster of matches, as HTML with <mark>. */
  excerpt(content: string, query: string, words?: number): string;
  /** For `pagefind.search()` / `debouncedSearch()`. */
  processQuery(query: string): string;
}

/** Around each hidden block: Pagefind keeps them in `content` but never indexes them. */
export const OPEN = "⁅", CLOSE = "⁆";
const HIDDEN = /[.\s]*⁅[^⁆]*(?:⁆|$)/g;
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

export function faPagefind(options: AdapterOptions = {}): PagefindAdapter {
  const analyzer = adapterAnalyzer(options, "lemma"); // every query word must match (H10)
  const processQuery = (query: string) => queryTerms(analyzer, query).join(" ");

  function excerpt(content: string, query: string, words = 30): string {
    const visible = content.replace(HIDDEN, " ").trim();
    const wanted = queryTerms(analyzer, query);
    const tokens = analyzer.tokens(visible);
    // As Pagefind matches: a query term matches any term it is a prefix of.
    const hit = tokens.map((t) => [t.text.replaceAll("\u200C", ""), ...analyzer.analyze(t.text, { mode: "index" })].some((x) => wanted.some((w) => x.startsWith(w))));
    // The window of `words` tokens with the most hits; ties go to the earliest.
    let best = 0, bestHits = -1, hits = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (hit[i]) hits++;
      if (i >= words && hit[i - words]) hits--;
      if (hits > bestHits) { bestHits = hits; best = Math.max(0, i - words + 1); }
    }
    // Center the window on its first and last hit.
    const first = hit.indexOf(true, best), last = hit.lastIndexOf(true, best + words - 1);
    if (first >= 0 && first <= last) best = Math.max(0, Math.min(tokens.length - words, Math.round((first + last - words + 1) / 2)));
    const window = tokens.slice(best, best + words);
    if (!window.length) return escapeHtml(visible.slice(0, 200));
    let out = "", at = window[0]!.start;
    window.forEach((t, k) => {
      out += escapeHtml(visible.slice(at, t.start));
      const word = escapeHtml(visible.slice(t.start, t.end));
      out += hit[best + k] ? `<mark>${word}</mark>` : word;
      at = t.end;
    });
    return out;
  }

  let lastQuery = "";
  return {
    processTerm(term) {
      lastQuery = term;
      return processQuery(term);
    },
    processResult(result, query = lastQuery) {
      // A window inside a long block shows neither marker, so every annotated page gets a new excerpt.
      if (result.content?.includes(OPEN)) result.excerpt = excerpt(result.content, query);
      for (const sub of result.sub_results ?? []) sub.excerpt = sub.excerpt.replace(HIDDEN, "");
      // The page's own title, when the index side ranked a normalized one (`title` option).
      // Removed after use: Pagefind UI lists every other meta field under the result.
      if (result.meta?.fa_title !== undefined) { result.meta.title = result.meta.fa_title; delete result.meta.fa_title; }
      return result;
    },
    excerpt,
    processQuery,
  };
}
