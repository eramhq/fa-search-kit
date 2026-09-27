/**
 * fa-search-kit/flexsearch: an encoder for FlexSearch.
 *
 *     import FlexSearch from "flexsearch";
 *     import { faDocument, faEncode } from "fa-search-kit/flexsearch";
 *
 *     // Recommended: index mode on add, query mode on search.
 *     const index = faDocument(FlexSearch, { document: { id: "id", index: ["title", "body"] } });
 *
 *     // Drop-in: one encode function for both sides, so query mode on both.
 *     const index = new FlexSearch.Document({ document: { ... }, encode: faEncode() });
 *
 * FlexSearch calls the same `encode` when it adds and when it searches, with no
 * way to tell them apart. The drop-in encoder therefore cannot index the extra
 * terms of index mode (a half-space compound's parts, the other half-space
 * spelling, the word without its madda), so «کتاب خانه» typed with a space does
 * not find «کتاب‌خانه». `faDocument` switches the encoder to index mode while
 * `add`, `append` and `update` run (synchronously; not with `worker` or the
 * `*Async` methods, which run the encoder later).
 */
import type { Analyzer } from "../analyzer.ts";
import { adapterAnalyzer, queryTerms, type AdapterOptions } from "./shared.ts";

/** Verbs default to "lemma": FlexSearch requires every query word (H10). */
export function faEncode(options: AdapterOptions = {}): (text: string) => string[] {
  const analyzer = adapterAnalyzer(options, "lemma");
  return (text) => queryTerms(analyzer, String(text));
}

type Writer = "add" | "append" | "update";

/**
 * A FlexSearch `Document` whose `add`, `append` and `update` analyze in index mode
 * and whose `search` analyzes in query mode. `options` are the Document's options
 * (an `encode` or `encoder` in them is replaced); `fa` configures the analyzer.
 */
export function faDocument<D>(FlexSearch: { Document: new (options: never) => D }, options: object, fa: AdapterOptions = {}): D {
  const analyzer: Analyzer = adapterAnalyzer(fa, "lemma");
  let mode: "index" | "query" = "query";
  const encode = (text: string) =>
    mode === "index" ? analyzer.analyze(String(text), { mode }) : queryTerms(analyzer, String(text));
  const { encoder: _encoder, ...rest } = options as { encoder?: unknown };
  const doc = new FlexSearch.Document({ ...rest, encode } as never) as D & Record<Writer, (...args: unknown[]) => unknown>;
  for (const name of ["add", "append", "update"] as const) {
    const write = doc[name];
    if (typeof write !== "function") continue;
    doc[name] = function (this: unknown, ...args: unknown[]) {
      const outer = mode;
      mode = "index";
      try { return write.apply(doc, args); } finally { mode = outer; }
    };
  }
  return doc;
}
