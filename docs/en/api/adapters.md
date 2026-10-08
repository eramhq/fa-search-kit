---
title: "Search adapter API"
description: "Find public engine hooks, Pagefind build controls, and browser result processing methods."
---

# Search adapter API

Use [Pagefind integration](../guides/pagefind.md) or the [client-engine examples](../guides/client-engines.md) for runnable setup. This page lists the public modules and their returned hooks.

## Shared options

Adapters accept analyzer options plus `analyzer?: Analyzer`. A supplied analyzer is used as-is, ignoring the other analysis settings. Otherwise a supplied lexicon selects full unless profile is explicit. Adapter-specific options such as Orama `exactTerms` still apply. `AdapterOptions` itself is internal and is not exported from a public subpath; import the concrete adapter's option type where exported, or use the root `AnalyzerOptions` for shared analysis settings.

## fa-search-kit/pagefind

`faPagefind(options = {}): PagefindAdapter` defaults full-profile verbs to lemma. It returns:

- `processQuery(query: string): string`: deduplicated query terms joined by spaces; does not remember the query.
- `processTerm(term: string): string`: the same processing, remembering the query for UI result processing.
- `processResult<R extends PagefindResultData>(result: R, query?: string): R`: mutates excerpts/title and returns the input object. Omitted query uses the last `processTerm` input.
- `excerpt(content: string, query: string, words = 30): string`: escaped HTML with mark elements around prefix matches in a token window. Use a positive word count. It is a text-content API, not a general HTML sanitizer/parser.

`PagefindResultData` contains `content`, `excerpt`, optional `meta: Record<string, string>`, and optional `sub_results: { excerpt: string }[]`. The module exports this type and `PagefindAdapter`, plus the hidden-block delimiter constants `OPEN` (`⁅`) and `CLOSE` (`⁆`). Do not use those markers for ordinary page content.

## fa-search-kit/pagefind/build

`faPagefindIndex(options?: PagefindIndexOptions): PagefindIndexAdapter` returns `annotateHtml(html, { words?: boolean } = {}): string` and `addPages(index: PagefindIndex, pages: Iterable<{ url?: string; sourcePath?: string; content: string }>): Promise<string[]>`. Annotation returns new HTML; the CLI writes it in place. `words: false` on annotation skips vocabulary collection for that page, not annotation itself. `addPages` returns Pagefind error strings; check them.

`PagefindIndex` requires async `addHTMLFile({ url?, sourcePath?, content })` returning `{ errors: string[] }`. The build module exports `PagefindIndex`, `PagefindIndexAdapter`, `PagefindIndexOptions`, and `BODY`, the regex detecting a body marker.

Additional build options:

- `terms: "all" | "new" | "prefix"`, default all: keep every analyzed term, omit terms already present as Pagefind words, or also omit terms that are prefixes of longer existing terms. These change page-length scoring and matching evidence.
- `weight?: number`: body-term block weight; heading terms retain their inherited/heading weight. Use a positive value.
- `title: "keep" | "fold" | "terms"`, default terms: leave title metadata, normalize it, or analyze it. Fold/terms preserve the display title in `fa_title`; explicitly provided title metadata is left alone.
- `surface?: boolean`, default true: add normalized surface variants that Pagefind would read differently.
- `words?: { add(text: string): void }`: receives searchable text before hidden terms are added.

CLI `fa-search-kit-pagefind <site-dir>` accepts `--profile light|standard|full`, `--verbs lemma|stem`, `--words`, `--words-dir <dir>`, and `--help`/`-h`. It recursively annotates `.html`/`.htm` files. Profile defaults to standard; browser configuration must match. Use only the documented verb values; the CLI does not validate arbitrary verb strings.

## fa-search-kit/orama

`faTokenizer(options?: OramaTokenizerOptions): OramaTokenizer`. Options add `exactTerms?: boolean` (true). The returned object has `language: string`, `normalizationCache: Map<string, string>`, and `tokenize(raw, language?, prop?, withCache?): string[]`. The adapter uses `prop === undefined` for queries, otherwise indexing; it ignores the other tokenizer-call arguments. Both named types are exported. Full verbs default to stem.

## fa-search-kit/minisearch

`faMiniSearch(options?: MiniSearchAdapterOptions): MiniSearchAdapter`. Options add `combineWith?: "OR" | "AND"`. Returned `tokenize(text)` analyzes documents; `processTerm(term)` is identity. `searchOptions` contains query `tokenize`, identity `processTerm`, and optional `combineWith`. Both named types are exported. Full verbs default to lemma only with AND, otherwise stem.

## fa-search-kit/flexsearch

`faEncode(options = {}): (text: string) => string[]` uses query mode on both sides. `faDocument<D>(FlexSearch: { Document: new (options: never) => D }, options: object, fa = {}): D` returns a Document with wrapped synchronous writes. It replaces encoders; workers and async writes are unsupported. There are no separately exported option/result types in this module. Full verbs default to lemma.

## fa-search-kit/lunr

`faLunr(lunr: LunrModule, options = {}): LunrPlugin` returns the builder plugin and its `search<R>(index, query: string): R[]` method. It returns an empty array for an empty analyzed query. `LunrModule` describes the supplied `Token` constructor; `LunrPlugin` describes the plugin and search method. Both types are exported. Full verbs default to stem. Search operators are not interpreted by the helper.

## Optional rescue

`fa-search-kit/pagefind/rescue` is documented with the [rescue API](rescue.md). It is separate from both build annotation and ordinary query analysis.
