---
title: "Persian text analysis for search"
description: "Understand what fa-search-kit contributes to a search system and where its responsibilities end."
---

# Persian text analysis for search

fa-search-kit prepares Persian text for keyword search. It normalizes spelling variants, tokenizes text, and optionally stems words or maps known forms through a lexicon. Adapters connect that analysis to Pagefind, Orama, MiniSearch, FlexSearch, and Lunr.

After [installing from source](installation.md), analyze a query:

```js
import { createAnalyzer } from "fa-search-kit";
const analyzer = createAnalyzer();
console.log(JSON.stringify(analyzer.analyze("كتابهاي من", { mode: "query" }))); // => ["کتاب","من"]
```

The returned strings are search terms, not display text. The original string remains unchanged. Your search engine still builds the index, ranks matches, and retrieves documents. This is not semantic search or an AI service; runtime analysis uses rules and bundled data.

## Choose a path

- [Getting started](getting-started.md): a complete MiniSearch example with two documents.
- [Pagefind](guides/pagefind.md): annotate a static site, then process browser queries and excerpts.
- [Other search engines](guides/client-engines.md): wire Orama, MiniSearch, FlexSearch, or Lunr.
- [Text analysis](text-analysis.md) and [profiles](profiles.md): choose how much spelling and inflection variation to match.
- [Query rescue](query-rescue.md): optionally use the site's vocabulary to propose corrections.

## When it fits

Use it for Persian documentation, article, or product search where variants such as Arabic letter forms, digits, and half-spaces should reach the same content. Keep readable source text alongside search terms. Share configuration between indexing and querying.

It does not provide a search database, ranking policy, translations, general synonyms, Finglish transliteration, contextual language understanding, or a complete Persian grammar. Rules can merge unrelated words or miss valid forms. Mixed Latin text is tokenized and commonly lowercased; there is no English stemmer or stop-word list in the analyzer.

## Eram's documentation search

Eram's website uses Pagefind with `profile: "full"`, the bundled lexicon, and `verbs: "lemma"` for Persian docs. Its local fallback also uses that analyzer. Optional rescue is demonstrated on the product page; it is not enabled in docs search.

See [limitations and data](data-and-benchmarks.md) and [known issues](recipes.md) before deploying.
