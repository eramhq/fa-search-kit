---
title: "Keep indexing and queries aligned"
description: "Share analyzer settings while using the appropriate mode on each side of the index."
---

# Keep indexing and queries aligned

Use one analyzer configuration for both documents and queries. The modes intentionally differ: index mode can add alternatives, while query mode keeps the main term for each token.

```js
import { createAnalyzer } from "fa-search-kit";
const analyzer = createAnalyzer();
console.log(JSON.stringify(analyzer.analyze("کتاب‌خانه", { mode: "index" }))); // => ["کتابخانه","کتاب","خانه"]
console.log(JSON.stringify(analyzer.analyze("کتاب‌خانه", { mode: "query" }))); // => ["کتابخانه"]
console.log(JSON.stringify(analyzer.analyze("آسمان", { mode: "index" }))); // => ["آسمان","اسمان"]
console.log(JSON.stringify(analyzer.analyze("آسمان", { mode: "query" }))); // => ["آسمان"]
```

## Why the modes differ

`analyze(text)` defaults to index mode. With the default options it can add compound parts, alternate half-space spellings, and madda-less forms. Query mode avoids requiring all of those alternatives at once. For the same text and settings, query terms are a subset of index terms. This is not a guarantee that arbitrary different texts will match.

The analyzer does not deduplicate repeated terms. The adapters deduplicate query terms to avoid counting the same term repeatedly. Index repetition can affect engine ranking. No analyzer-level stop-word removal is provided.

## Share configuration explicitly

For an in-memory engine, create an analyzer and pass `{ analyzer }` to the adapter and rescue. All other analyzer options on that adapter are then ignored. For a separate static-site build and browser bundle, keep the same profile, lexicon version, verb mode, and switches in a shared configuration or equivalent build arguments. Do not serialize an analyzer object as JSON; recreate it from versioned configuration.

A full analyzer used with MiniSearch OR must explicitly select `verbs: "stem"` if you want the adapter's usual default. An already-created analyzer is never reconfigured by the adapter.

## Rebuild and deploy together

Rebuild after changing profiles, normalization, rejoining, stem/clitic options, verb mode, lexicon data, or package versions that change terms. Adapter changes such as Orama `exactTerms` or Pagefind `terms`, `surface`, and title processing also change indexed data. Rebuild rescue vocabulary when content changes.

Publish the index, query bundle, and optional vocabulary as one compatible version. A saved engine index still needs its engine-specific loading setup and the same adapter on the query side. This library supplies no universal index serialization format or migration tool.

Original source text remains the source of truth for display and rebuilding. Do not save only stems and expect to recover text or reliable original offsets later.
