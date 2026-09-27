# Phase 2: the shipped adapters — results

**Test split, computed once** at the end of the phase (2026-09-27), after all tuning on
dev. Tables: [phase2-test.md](phase2-test.md) (every cell, n and 95% intervals in
[phase2-test.json](phase2-test.json)); decisions: [experiments.md](experiments.md),
"Phase 2" (P1–P4); gates: `compare/<A>--<B>.test.md` (not committed: they quote lost
queries, fragments of CC BY-SA titles; regenerate with `node bench/compare.ts <A> <B> --split test`).

Phase 1 measured the analyzer through bench-internal wiring: every engine got
pre-analyzed text with its own processing switched off. Phase 2 ships the adapters a
site actually uses, and from now on the benchmark measures **them**:

| entry | what a site does | gzip |
|---|---|---:|
| `fa-search-kit/orama` | `components: { tokenizer: faTokenizer() }` (index mode when Orama passes a property, query mode when it does not; every term ends with a sentinel) | core + 0.14 KB |
| `fa-search-kit/minisearch` | `...faMiniSearch()` into the options (tokenize / processTerm, and `searchOptions` for the query side) | core + 0.13 KB |
| `fa-search-kit/flexsearch` | `faDocument(FlexSearch, options)` (index mode while adding), or the drop-in `encode: faEncode()` | core + 0.21 KB |
| `fa-search-kit/lunr` | `this.use(faLunr(lunr))`, then `fa.search(idx, q)` | core + 0.19 KB |
| `fa-search-kit/pagefind` | Pagefind UI `processTerm` / `processResult`, or `processQuery` for the JS API | core + 0.57 KB |
| `fa-search-kit/pagefind/build` | `npx fa-search-kit-pagefind dist` before `npx pagefind`, or `addPages` with the Node API (build time only) | core + 1.86 KB |

Core 4.95 KB, lexicon 7.83 KB (unchanged). Budgets: core ≤ 5 KB, lexicon ≤ 15 KB, each
browser adapter ≤ core + 1 KB (`node scripts/size.ts`, on `src/` and the built `dist/`).
The package, packed and installed into a fresh project, imports, bundles, type-checks
and answers a Persian query on every subpath (`node scripts/smoke-pack.ts`).

## The gate

Against Phase 1's wiring (`p1-*`, the same profiles and the same analyzer), per corpus
× engine × variant type, BH-adjusted; a cell blocks at q < .05 and a drop of ≥ 2 points:

| comparison | dev: up / down / blocking | test: up / down / blocking | blocking cells (test) |
|---|---|---|---|
| p1-light → fa-light | 53 / 4 / 4 | 54 / 4 / 4 | wiki Orama typo-delete, wiki and products Orama plural-drop, products Pagefind std-typing |
| p1-standard → fa-standard | 58 / 2 / 2 | 62 / 2 / 2 | wiki Orama typo-delete (−10.0), products Pagefind std-typing (−5.5) |
| p1-full → fa-full | 57 / 2 / 2 | 60 / 3 / 2 | the same two (−9.3, −5.5) |

Every blocking cell is the cost of an experiment decision:
- **Orama typo-delete** (and light's Orama plural-drop): Orama matches every query term
  as a prefix and sums the scores of every word it prefixes. The adapter's sentinel
  switches that off (P3: without it 55 cells block, canonical products 97 → 86); prefix
  matching was also what let a query missing its last letters, or light's singular,
  reach the page. Typos are Phase 3; light has no stemmer by design.
- **Pagefind products std-typing** (pages typed with Arabic ي/ك): P1. Phase 1's wiring
  replaced each page's text with analyzed terms, which cannot ship (results, titles and
  excerpts come from that text). With the page's own text kept, Pagefind's page-length
  normalization and its prefix matching against visible Persian words favour pages
  already typed in standard Persian; on short, near-duplicate product pages that decides
  near-ties. The chosen layout recovers most of it (dev −12.4 → −10.5; test −5.5);
  against stock Pagefind the row goes 25 → 83 (test).

Against stock engines and against plain Snowball the adapters do better than Phase 1's
wiring did: stock → fa-standard 236 up / 8 blocking on test (dev: 241 / 10, where
stock → p1-standard was 235 / 13, the adapter's blocks a subset of those); snowball →
fa-standard 136 up / 4 blocking (test).

## Target rows

Recall@10 in %, test split, **stock → p1-full → fa-full** (the adapters). fa-full uses
verb lemmas on Pagefind and FlexSearch, tense-keeping stems on Orama, MiniSearch and
Lunr (H10); stock Orama and Lunr index no Persian, hence their zeros.

**wiki**

| type | n | pagefind | orama | minisearch | flexsearch | lunr |
|---|---:|---|---|---|---|---|
| canonical | 500 | 100 → 99 → 99 | 0 → 97 → 100 | 100 → 100 → 100 | 100 → 100 → 100 | 0 → 100 → 100 |
| arabic-yk | 352 | 3 → 99 → 99 | 0 → 97 → 99 | 16 → 100 → 100 | 1 → 100 → 100 | 0 → 99 → 99 |
| alef-madda | 146 | 99 → 98 → 98 | 0 → 90 → 99 | 31 → 100 → 100 | 5 → 100 → 100 | 0 → 100 → 100 |
| hamza | 100 | 46 → 86 → 87 | 0 → 85 → 91 | 69 → 92 → 92 | 30 → 87 → 87 | 1 → 92 → 92 |
| digits | 85 | 11 → 100 → 100 | 6 → 88 → 100 | 64 → 100 → 100 | 8 → 100 → 100 | 5 → 100 → 100 |
| zwnj-space | 153 | 50 → 96 → 96 | 0 → 81 → 93 | 50 → 99 → 99 | 100 → 99 → 99 | 0 → 99 → 99 |
| plural-drop | 148 | 97 → 94 → 97 | 0 → 84 → 95 | 70 → 97 → 97 | 81 → 97 → 97 | 0 → 95 → 95 |
| clitic-add | 151 | 12 → 76 → 75 | 0 → 78 → 86 | 75 → 86 → 86 | 3 → 74 → 74 | 0 → 87 → 87 |
| combo | 156 | 10 → 97 → 97 | 0 → 90 → 97 | 26 → 99 → 99 | 13 → 99 → 99 | 0 → 98 → 98 |

**news**

| type | n | pagefind | orama | minisearch | flexsearch | lunr |
|---|---:|---|---|---|---|---|
| canonical | 500 | 100 → 100 → 100 | 0 → 97 → 100 | 100 → 100 → 100 | 100 → 100 → 100 | 0 → 99 → 99 |
| arabic-yk | 455 | 8 → 100 → 100 | 0 → 97 → 100 | 60 → 100 → 100 | 0 → 100 → 100 | 0 → 99 → 99 |
| hamza | 148 | 14 → 89 → 89 | 0 → 95 → 100 | 99 → 100 → 100 | 10 → 88 → 88 | 0 → 99 → 99 |
| zwnj-space | 175 | 21 → 99 → 99 | 1 → 97 → 100 | 88 → 100 → 100 | 100 → 99 → 99 | 1 → 98 → 98 |
| zwnj-join | 175 | 99 → 99 → 99 | 1 → 96 → 100 | 91 → 100 → 100 | 0 → 100 → 100 | 1 → 100 → 100 |
| clitic-add | 158 | 42 → 91 → 91 | 1 → 94 → 99 | 97 → 99 → 99 | 1 → 87 → 87 | 1 → 98 → 98 |
| verb-tense | 198 | 22 → 97 → 97 | 1 → 88 → 98 | 99 → 98 → 98 | 11 → 93 → 93 | 1 → 96 → 96 |
| verb-tense-ud | 153 | 8 → 82 → 82 | 0 → 87 → 97 | 98 → 97 → 97 | 5 → 78 → 78 | 0 → 97 → 97 |
| combo | 339 | 11 → 99 → 99 | 0 → 97 → 100 | 52 → 100 → 100 | 6 → 98 → 98 | 0 → 99 → 99 |

**products**

| type | n | pagefind | orama | minisearch | flexsearch | lunr |
|---|---:|---|---|---|---|---|
| canonical | 500 | 100 → 100 → 100 | 13 → 86 → 97 | 100 → 100 → 100 | 100 → 100 → 100 | 13 → 100 → 100 |
| std-typing | 110 | 25 → 88 → 83 | 2 → 56 → 87 | 23 → 88 → 88 | 7 → 90 → 91 | 2 → 88 → 88 |
| arabic-yk | 396 | 7 → 100 → 100 | 14 → 86 → 97 | 44 → 100 → 100 | 0 → 100 → 100 | 13 → 99 → 99 |
| alef-madda | 137 | 100 → 99 → 99 | 8 → 80 → 94 | 61 → 99 → 99 | 2 → 99 → 99 | 9 → 99 → 99 |
| zwnj-join | 71 | 100 → 99 → 100 | 4 → 70 → 89 | 51 → 97 → 97 | 0 → 100 → 100 | 6 → 97 → 97 |
| plural-drop | 45 | 91 → 93 → 100 | 4 → 60 → 80 | 13 → 89 → 89 | 18 → 96 → 96 | 4 → 89 → 89 |
| clitic-add | 245 | 85 → 87 → 87 | 14 → 77 → 92 | 92 → 95 → 95 | 3 → 71 → 71 | 14 → 96 → 96 |
| combo | 360 | 25 → 99 → 99 | 15 → 85 → 97 | 50 → 99 → 99 | 0 → 99 → 99 | 11 → 99 → 99 |

MiniSearch, FlexSearch and Lunr through their adapters match Phase 1's wiring: of 64
recall cells each (test, fa-full), MiniSearch differs in none, FlexSearch and Lunr in
one each by under a point (their hooks see exactly the analyzer's terms; query terms
are now deduplicated). **Orama gains the most**: the
sentinel ends its prefix-score noise, the Phase 1 blocker (products canonical 86 → 97,
std-typing 56 → 87, news verb-tense 88 → 98). **Pagefind** keeps Phase 1's recall with
readable results (below), at the products std-typing cost above.

## Pagefind: what a visitor sees

Pagefind builds excerpts and titles from the indexed text, and hidden text counts
(probed on 1.5.2; `data-pagefind-index-attrs` text too). The index side therefore adds
its terms in hidden blocks wrapped in ⁅…⁆ (kept in Pagefind's `content`, never
searchable, no extra word count), gives Pagefind the title's analyzed terms as its
title meta (Pagefind ranks title matches far above the rest) with the real title as
`fa_title`, and `processResult` rebuilds the excerpt from the page's visible text,
marks the matched words, and restores the title.

- Excerpt check ([excerpts.md](excerpts.md): `node bench/excerpts.ts`, 300 dev queries
  per corpus, every top-10 result): Pagefind's own excerpt shows the block for 42% of
  wiki results, 46–65% on news, 100% on products (short pages). After `processResult`
  none do, and 99.4–100% mark a page word on the rows the analyzer handles; on typo and
  layout rows fewer than Pagefind's own (wiki 42% vs 64%: Pagefind backs misspelled
  words off to shorter prefixes, the rebuild does not follow; Phase 3).
- Demo replay (`node demo/check.ts`: 600 pages, 3,167 benchmark queries whose targets
  are in the demo): stock Pagefind finds 60%, fa-search-kit 98%; of 4,269 top-3
  results, 0 excerpts show the hidden block after `processResult`, 100% mark a word,
  100% show the page's own title.

## Found on the way (all in experiments.md, P1b–P1e)

- Pagefind indexes a half-space word joined («تی‌شرت» → «تیشرت», «شرت» alone finds
  nothing), not as parts, and silently drops query words it does not know.
- A Pagefind page's score falls with every extra word; a ⁅ marker on its own counts as
  a word, one glued to a term does not; the position of a match does not matter.
- `data-pagefind-meta="title[data-x]"` takes the value from an attribute: commas safe,
  nothing added to the indexed text.
- FlexSearch calls one `encode` for both sides with no way to tell them apart (P2: the
  drop-in loses alef-madda 99 → 0–6, zwnj-space −25 to −52), hence `faDocument`.
- MiniSearch under `combineWith: "AND"` needs verb lemmas like Pagefind (P4: news
  verb-tense 24 → 95).

## Still open

- Products Pagefind std-typing vs Phase 1's wiring (above): the upstream Pagefind PR
  (Phase 4, Persian folding inside Pagefind) removes the asymmetry at the source.
- The demo was checked headless (`demo/check.ts`, same pagefind.js + WASM a browser
  loads); the in-browser check with Claude-in-Chrome is pending (extension not
  connected during this session).
- Typo rows (Orama typo-delete) and query rescue: Phase 3. Negation precision, H4, H6:
  unchanged from Phase 1.
