---
title: "Integrate client-side search engines"
description: "Connect MiniSearch, Orama, FlexSearch, and Lunr using their supported adapter paths."
---

# Integrate client-side search engines

Each example is independent and uses the standard profile. Install the package from source and the matching engine version listed in [installation](../installation.md). Run the snippets as ESM in Node or bundle them for the browser. The adapters do not supply a UI or replace engine ranking.

## MiniSearch

```js
import MiniSearch from "minisearch";
import { faMiniSearch } from "fa-search-kit/minisearch";
const fa = faMiniSearch();
const index = new MiniSearch({
  fields: ["title"], storeFields: ["title"], ...fa,
  searchOptions: { ...fa.searchOptions, boost: { title: 2 } },
});
index.addAll([
  { id: "books", title: "كتابهاي قديمي" },
  { id: "car", title: "ماشین قرمز" },
]);
console.log(JSON.stringify(index.search("کتاب").map(({ id, title }) => ({ id, title })))); // => [{"id":"books","title":"كتابهاي قديمي"}]
```

The adapter supplies index `tokenize`, identity `processTerm`, and query versions under `searchOptions`. Merge that object when adding boosts, prefix, or fuzzy options. Replacing it loses query-mode analysis. `autoSuggest` also uses those search options.

Default matching is MiniSearch's OR. Use `faMiniSearch({ combineWith: "AND", lexicon })` for AND and full-profile lemma defaults. Import `lexicon` from `fa-search-kit/lexicon` first. When changing combineWith later, keep verb behavior intentional and rebuild if terms change. Fuzzy matching and prefix search are engine features; evaluate their ranking effects separately from rescue.

## Orama

```js
import { create, insertMultiple, search } from "@orama/orama";
import { faTokenizer } from "fa-search-kit/orama";
const db = create({
  schema: { title: "string" },
  components: { tokenizer: faTokenizer() },
});
await insertMultiple(db, [{ id: "books", title: "كتابهاي قديمي" }]);
console.log(JSON.stringify((await search(db, { term: "کتاب" })).hits.map(h => h.id))); // => ["books"]
```

Do not also pass `language` to `create` with a custom tokenizer. Orama supplies a property name while indexing and no property during queries; the adapter uses this to select modes.

`exactTerms: true` is the default: it appends `_` to each term to prevent ordinary prefix lookup from matching longer words. Set `exactTerms: false` to retain prefix matching and rebuild the index. This is different from Orama's `exact: true`: in the tested 3.1.18 version that option uses a word-boundary test unsuitable for Persian. Engine typo tolerance remains separate; no tolerance is enabled by this adapter. Full-profile verbs default to stem.

## FlexSearch

```js
import FlexSearch from "flexsearch";
import { faDocument, faEncode } from "fa-search-kit/flexsearch";
const options = { document: { id: "id", index: ["title"] } };
const index = faDocument(FlexSearch, options);
index.add({ id: "books", title: "کتاب‌خانه" });
console.log(JSON.stringify(index.search("کتاب خانه", { merge: true }).map(h => h.id))); // => ["books"]
const simple = new FlexSearch.Document({ ...options, encode: faEncode() });
simple.add({ id: "books", title: "کتاب‌خانه" });
console.log(JSON.stringify(simple.search("کتاب خانه", { merge: true }))); // => []
```

`faDocument` wraps synchronous `add`, `append`, and `update` to use index mode, then restores query mode for search. It replaces any `encode` or `encoder` supplied in Document options. Other options, including stored fields, remain yours.

Do not combine this wrapper with workers or `*Async` writes: encoding can run after the temporary mode has been restored. The drop-in `faEncode` uses query mode on both sides, so it cannot add compound parts, alternate half-space terms, or madda-less index alternatives. It is a deliberate reduced-capability path. Full-profile verbs default to lemma.

## Lunr

```js
import lunr from "lunr";
import { faLunr } from "fa-search-kit/lunr";
const fa = faLunr(lunr);
const index = lunr(function () {
  this.use(fa);
  this.ref("id");
  this.field("title");
  this.add({ id: "books", title: "كتابهاي قديمي" });
});
console.log(JSON.stringify(fa.search(index, "کتاب").map(h => h.ref))); // => ["books"]
```

The plugin resets both English pipelines and replaces the builder tokenizer. Search through `fa.search(index, query)`; `index.search()` uses Lunr's own parser and bypasses the adapter tokenizer.

The helper adds analyzed terms with `usePipeline: false`; any term may match. Lunr syntax characters such as `:`, `~`, `^`, `+`, `-`, and `*` are treated as input text/separators, not operators. Advanced field queries or required/prohibited clauses need your own deliberate integration through Lunr's query API. The plugin assigns token sequence metadata, not original character positions. Full-profile verbs default to stem.

See [shared configuration](../indexing.md), [highlighting](../text-analysis.md), and [adapter signatures](../api/adapters.md).
