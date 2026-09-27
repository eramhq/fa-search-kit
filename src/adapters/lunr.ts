/**
 * fa-search-kit/lunr: a Lunr plugin and a search function.
 *
 *     import lunr from "lunr";
 *     import { faLunr } from "fa-search-kit/lunr";
 *     const fa = faLunr(lunr);
 *     const idx = lunr(function () { this.use(fa); this.ref("id"); this.field("title"); ... });
 *     fa.search(idx, "کتاب‌های من");
 *
 * The plugin empties Lunr's pipelines (its trimmer deletes every Persian letter,
 * its stemmer and stop words are English) and replaces the tokenizer with the
 * analyzer in index mode. `idx.search()` cannot be used for the query side: Lunr's
 * query parser splits the text itself and never calls the tokenizer. `fa.search`
 * analyzes the whole query and hands Lunr the terms, which also means that
 * characters of Lunr's query syntax (`: ~ ^ + - *`) are plain text, not operators.
 */
import { adapterAnalyzer, queryTerms, type AdapterOptions } from "./shared.ts";

/** The parts of Lunr this uses, so the package never imports it. */
export interface LunrModule {
  Token: new (str: string, metadata: object) => unknown;
}
interface LunrBuilder {
  pipeline: { reset(): void };
  searchPipeline: { reset(): void };
  tokenizer: (obj: unknown, metadata?: object) => unknown[];
}
interface LunrIndex<R> {
  query(fn: (q: { term(term: string, options: { usePipeline: boolean }): unknown }) => void): R[];
}

export interface LunrPlugin {
  (this: unknown, builder: LunrBuilder): void;
  /** Search an index built with this plugin: the query is analyzed in query mode, any term may match. */
  search<R>(index: LunrIndex<R>, query: string): R[];
}

/** Verbs default to "stem": Lunr matches any query word (H10). */
export function faLunr(lunr: LunrModule, options: AdapterOptions = {}): LunrPlugin {
  const analyzer = adapterAnalyzer(options, "stem");
  const plugin = function (builder: LunrBuilder) {
    builder.pipeline.reset();
    builder.searchPipeline.reset();
    builder.tokenizer = (obj, metadata) => {
      if (obj == null) return [];
      const text = Array.isArray(obj) ? obj.join(" ") : String(obj);
      return analyzer.analyze(text, { mode: "index" }).map((t, index) => new lunr.Token(t, { ...metadata, index }));
    };
  } as LunrPlugin;
  plugin.search = (index, query) => {
    const terms = queryTerms(analyzer, query);
    if (!terms.length) return [];
    return index.query((q) => { for (const t of terms) q.term(t, { usePipeline: false }); });
  };
  return plugin;
}
