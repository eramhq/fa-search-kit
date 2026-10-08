---
title: "Run your first Persian search"
description: "Index two documents and see how normalized query terms find the original text."
---

# Run your first Persian search

This example uses the standard analyzer through MiniSearch. Complete [installation](installation.md), including `minisearch@7.2.0`, then save this as `search.mjs` and run `node search.mjs`.

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

## Read the result

The query uses Persian letters and the singular word «کتاب». The stored title uses Arabic kaf and yeh and a joined plural suffix. The adapter analyzes both sides, so MiniSearch finds `books`. `storeFields` makes the original title available in the result; it is still «كتابهاي قديمي». The library does not rewrite your document.

MiniSearch decides the score and result order. This example intentionally checks IDs and original content rather than promising a stable score. `searchOptions` is merged with the adapter's settings so query analysis is preserved.

## Extend the example

Add a `body` field to `fields` and to each document to search longer content. Configure weights in MiniSearch, not in the analyzer. For known verb forms and broken plurals, load the [full profile](profiles.md). For misspellings or a wrong keyboard layout, explicitly add [query rescue](query-rescue.md).

Before saving an index for reuse, record its analyzer configuration and package version. Changing that configuration requires [reindexing](indexing.md).
