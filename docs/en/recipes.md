---
title: "Recipes and troubleshooting"
description: "Diagnose mismatched search results, render original text, and account for confirmed defects."
---

# Recipes and troubleshooting

When a result is missing, inspect the query terms and the indexed document's terms before changing ranking or enabling fuzzy matching. The examples in [indexing](indexing.md) make the two modes visible.

## Build highlight ranges for a custom UI

For exact analyzed-term matching, collect original spans and render the original text with text nodes and mark elements. This recipe returns ranges, not HTML:

```js
import { createAnalyzer } from "fa-search-kit";
const analyzer = createAnalyzer();
const text = "كتابهاي قديمي";
const query = "کتاب";
const wanted = new Set(analyzer.analyze(query, { mode: "query" }));
const ranges = analyzer.tokens(text)
  .filter(token => analyzer.analyze(token.text, { mode: "index" }).some(term => wanted.has(term)))
  .map(({ start, end }) => [start, end]);
console.log(JSON.stringify(ranges)); // => [[0,7]]
```

Merge overlapping ranges before rendering. For prefix or fuzzy engines, adapt the hit predicate to their semantics. Skip token-based highlighting for input containing supplementary characters until the offset issue below is fixed; display the original excerpt as plain text instead. Removing emoji before analysis changes offsets and is not a safe way to highlight the original string.

## Common integration problems

- Full throws on startup: import `lexicon` explicitly and pass it with `profile: "full"`.
- Results change after a deployment: compare index/query configuration and package versions, then rebuild and deploy compatible artifacts together.
- Pagefind shows stems or a strange title: annotate before indexing and call `processResult` after fetching each result. Confirm the original page is tagged `fa`.
- Pagefind has no expected pages: check `data-pagefind-body`, ignore markers, generated bundle URL, HTTP delivery, and build errors.
- MiniSearch loses variants: merge `fa.searchOptions` when adding your settings.
- Orama rejects configuration: omit `language` with the custom tokenizer; do not use its `exact: true` as a substitute for `exactTerms`.
- FlexSearch misses compound parts: use synchronous `faDocument` writes, not `faEncode` or workers/async writes when you need index alternatives.
- Lunr behaves differently on queries: call `fa.search`, not `index.search`.
- Rescue makes no useful suggestion: inspect the collected vocabulary, `isKnown`, network failures, and whether the candidate actually returns results. Absence of a suggestion is a supported outcome.

## Confirmed defects in this checkout

The following executable reproduction records current behavior, not desired behavior:

```js
import { createAnalyzer, Stemmer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";
import { createRescue } from "fa-search-kit/rescue";
const analyzer = createAnalyzer();
const token = analyzer.tokens("😀 کتاب")[0];
console.log(JSON.stringify([token.text, token.start, token.end ?? null])); // => ["کتاب",4,null]
console.log(JSON.stringify(new Stemmer({ lexicon, joinedMi: "lexicon", verbLemmas: false }).stem("میکنند"))); // => "میکنند"
const rescue = createRescue({ analyzer });
rescue.addText("صابون طبیعی");
await rescue.check("دیجی", 0);
rescue.addText("دیجی کالا");
console.log(JSON.stringify((await rescue.check("nd[d", 0))?.to ?? null)); // => null
const fresh = createRescue({ analyzer });
fresh.addText("صابون طبیعی دیجی کالا");
console.log(JSON.stringify((await fresh.check("nd[d", 0))?.to ?? null)); // => "دیجی"
```

### Supplementary Unicode offsets

The token after the emoji should span `[3, 7]`. It currently has start 4 and an undefined end (printed as null above). Normalization records spans per code point while tokenization indexes UTF-16 code units. This affects original-text highlighting, Pagefind excerpts, and potentially rescue edits in such strings. Treat it as a blocker for claiming general Unicode-safe highlighting.

### Joined-prefix lexicon option

The `joinedMi: "lexicon"` type exists, but no dedicated branch implements the documented guarded joined-prefix behavior. With `verbLemmas: false`, the known joined form in the reproduction stays unchanged. Prefer the analyzer's default `joinedMi: "rule"` or full-profile lemma analysis, according to your requirements; neither makes the missing option implementation complete.

### Rescue vocabulary changes

A negative known-word result is cached. `addText` adds terms but does not invalidate that cache, so later keyboard correction can miss a newly added word. The freshly created rescue instance demonstrates the difference. Populate before searching and recreate rescue after corpus changes. The current API has no reset/remove operation.

No library source was changed to conceal these defects. They need a separate fix and regression tests.

## Validate documentation locally

From this repository, run `npm run build`, `npm run typecheck`, `npm test`, and `node scripts/check-docs.mjs`. The docs checker validates navigation, metadata, locale parity, links, public imports, and the recorded outputs of runnable snippets; browser snippets are bundled but require a live UI for end-to-end behavior. `npm run smoke:pack` checks a fresh tarball consumer and the Pagefind CLI.

The files pass the website's source contract, but its current preview integration has two separate blockers: `docs:local` defaults to repository `abzar-php`, and `fa-search-kit` is absent from the docs manifest and sync list. Calling `prepareLocalDocs(sourceRoot, "fa-search-kit", output)` currently fails with “Repository is not in the website catalog.” The product catalog entry alone is insufficient.

The website must add this repository to its docs integration and allow an explicit repository name before its normal preview workflow can display these pages correctly. Those changes are outside this repository. The source collector and link rewriter can still validate these docs read-only. Once the website integration is ready, local review can use an unpublished snapshot; public imports still require a published GitHub release. A normal build never fetches these local edits.
