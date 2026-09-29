# Benchmark

How well do browser/JS search engines find Persian pages when people type the way
they really type? This folder measures it. Every later change to fa-search ships
only if it improves its target rows here without regressing the others.

## Run it

```sh
npm install
node bench/fetch.ts      # download pinned sources into bench/data/raw (~650 MB)
node bench/vocab.ts      # attestation vocabulary from all raw sources (~45 s)
node bench/corpus.ts     # sample the three corpora (20,000 docs each)
node bench/queries.ts    # build known-item queries and their variants
node bench/run.ts        # main configs × engines; cached per run in bench/data/runs
node bench/run.ts --config h8-keep,h2-zwnj   # experiment arms (and tuned) run only when named
node bench/run.ts --config fa-full   # after an analyzer/lexicon change: re-runs only where the words changed
node bench/run.ts --config fa-full --stamp   # record term fingerprints on current runs (no re-run)
node bench/run.ts --config fa-full --force   # after changing engine or adapter code: re-run everything
node bench/report.ts --split dev       # bench/results/report-dev.{md,json}
node bench/compare.ts snowball fa-standard --split dev   # the gate, see below
node bench/conflation.ts --configs snowball,fa-standard  # UD gold lemmas: under/over-stemming
node bench/collisions.ts               # what each fold rule merges (vocabulary pairs)
node bench/rejoin.ts                   # the tokenizer's rejoin rules on UD sentences
node bench/excerpts.ts                 # Pagefind excerpts under the adapter (P1)
node bench/rescue-queries.ts           # Phase 3 extra set: false-fix guards, typo-uniform
node bench/run.ts --config fa-full,fa-rescue --set rescue   # runs over the extra set
node bench/rescue-report.ts --split dev                     # query rescue at a glance
node demo/build.ts && node demo/check.ts   # the demo site and its replay, headless
node demo/browser-check.ts             # the demo page itself, in headless Chrome
```

The Phase 0 baseline (`results/baseline.md`) was run on the first query set
(`MIN_PER_TYPE = 150`, before the dev/test split); its numbers are not comparable
cell by cell with later reports. A cached run is used only if its query hash
matches the current query files.

`bench/data/` is gitignored: it holds CC BY-SA and other third-party text used for
evaluation only (see CLAUDE.md, "License hygiene"). Everything in it is rebuilt from
pinned revisions by the scripts above; `bench/data/raw/SOURCES.json` records each
file's sha256.

## Corpora

| corpus | source (pinned) | documents | what it stands for |
|---|---|---|---|
| wiki | Persian Wikipedia 2023-11-01 (`wikimedia/wikipedia`, first shard), articles ≥ 2,000 chars, no lists or disambiguation pages | title + first 3,000 chars | encyclopedic / blog prose |
| news | pn-summary (HooshvareLab), all splits, unique titles | title + first 3,000 chars | news: titles are sentences ending in a verb |
| products | Digikala product dump (RadeAI), stratified by category (clothing 25%, books 25%, beauty 20%, toys 15%, food 10%, travel 5%) | title; body = category + brand | shop search: short, noisy titles |

Text is kept exactly as published, including Arabic ي/ك, missing half-spaces and
diacritics, because that mess is part of what a search engine has to cope with.

## Queries: known-item search

For each sampled target document the query builder writes the query a person who
knows the page would type:

- Content words from the target's title (stop words dropped), **Persian words before
  Latin/digits, rarest first**, added until the words pin the target down: at most 3
  titles and at most 50 documents contain them all. At most 5 words.
- Products always keep the head noun (the product type, «کفش», «کرم»).
- News always keeps the title-final verb and at least 3 words.
- Words keep their title order and their spelling from the page.

That is the **canonical** query. Each variant generator then rewrites it the way
people actually type. The target is the same document, so the question is simply:
does the engine still put it in the top 10?

| type | what changes | example |
|---|---|---|
| canonical | nothing (control) | «نظریه تاریخ مارکس» |
| std-typing | page has Arabic letters or diacritics, searcher types standard Persian | «كتاب» on page → «کتاب» |
| arabic-yk | searcher's keyboard gives Arabic ي/ك | «جمعیت» → «جمعيت» |
| alef-madda | آ typed as ا | «کارآگاه» → «کاراگاه» |
| hamza | another accepted hamza spelling (the swap must occur ≥ 20 times in real text) | «رئیس» → «رییس», «تأثیر» → «تاثیر» |
| heh-yeh | ezafe after silent ه written as ۀ / هٔ / ه‌ی / ه | «نامه یعقوب» → «نامه‌ی یعقوب» |
| diacritics | page's harakat/tanwin dropped | «قبلاً» → «قبلا» |
| digits | Latin ↔ Persian digits | «حجم 30» → «حجم ۳۰» |
| zwnj-space | half-space typed as a space | «می‌کند» → «می کند» |
| zwnj-join | half-space left out | «می‌کند» → «میکند» |
| zwnj-add | page used a space or joined form, searcher types the half-space | «بانکهای» → «بانک‌های» |
| plural-add | searcher types the plural of the head noun (form must be attested) | «گوشی سامسونگ» → «گوشی‌های سامسونگ» |
| plural-drop | page has a ها plural, searcher types the singular | «قیمت‌ها» → «قیمت» |
| clitic-add | possessive clitic on the head noun (attested, ≥ 5 uses) | «کتاب» → «کتابش» |
| verb-tense | news only: the title-final verb in another tense | «تحویل شد» → «تحویل می‌شود» |
| verb-tense-ud | news only: the title-final verb in another form **with the same PerDT gold lemma** (preverb kept apart: دریافتن ≠ یافتن), attested; independent of Hazm and our conjugator, and covers perfect, passive and other forms it never makes | «رسید» → «رسیده‌اید» |
| verb-negation | news only: the title-final verb negated | «بود» → «نبود» |
| homophone | one letter swapped within ز ذ ض ظ / س ص ث / ت ط / ه ح / ق غ | «تحویل» → «طحویل» |
| typo-adjacent | one letter replaced by its neighbour key on ISIRI 9147 (never the first letter) | «صنایع» → «صناسع» |
| typo-delete | one letter dropped (never the first) | «اهواز» → «اهاز» |
| typo-transpose | two adjacent letters swapped (never the first) | «گلدونه» → «گلودنه» |
| layout-isiri9147 | typed on US layout while meaning Persian, standard layout | «دیجی» → `nd[d` |
| layout-win-legacy | same, legacy Windows Persian layout | «پروتز» → `\v,jc` |
| layout-mac-legacy | same, macOS "Persian – Legacy" layout | «پروتز» → `` `nmjb`` |
| layout-latin-on-fa | Latin brand/model typed while the Persian layout is on | `samsung` → «سشپسعدل» |
| combo | two everyday differences at once | «پیش‌نویس‌های» → «پيشنويسهاي» |

Rules that keep the variants honest:
- Every inflected form a generator invents (plural, clitic, verb tense, hamza
  spelling) must appear in `bench/data/vocab.tsv`: at least 3 uses across the full raw
  sources (1.4M word types). No generator tests a non-word.
- A variant identical to the canonical query is dropped; each type only counts
  queries it really changes.
- Rare types keep sampling extra ("supplementary") targets until they have 300
  queries or the corpus runs out (300, so each half of the split keeps ~150). Supplementary targets appear only in their own
  variant rows, never in the canonical row.
- Everything is seeded (`SEED = 20260926`, plus a per-document, per-type sub-seed),
  so the query files are identical on every machine.
- Phase 3's extra set (`bench/lib/rescue-sets.ts`, `data/queries/<corpus>.rescue.jsonl`)
  is kept apart so every cached main run stays valid: six false-fix guards (one-word
  queries fine as typed but not on the site: real words, 2–3-letter words, Latin names,
  tokens with digits, UD proper names, inflected forms of site words; a rewrite is a false
  fix) and typo-uniform (dev only: one letter of a content word, the first included,
  replaced by a uniformly random letter, so the speller's cost tables do not also write the
  test).
- Keyboard tables (`bench/lib/keyboards.ts`) were generated from the layouts
  themselves (Windows KLC exports, xkeyboard-config, and macOS via `UCKeyTranslate`),
  and the ISIRI 9147 standard's own PDF. Sources are listed in the file.

## Engines and configs

Engines: Pagefind 1.5.2 (real WASM search, run in Node through a fetch shim),
Orama 3.1.18, MiniSearch 7.2.0, FlexSearch 0.8.212, Lunr 2.3.9 (+ lunr-languages 1.22.0).
Phase 1 also ran `orama-exact` (every analyzed term ended by a sentinel, so a query
term matches only itself; Orama's default looks every query term up as a prefix and
sums the scores of all words it prefixes, RESEARCH.md §4). Since Phase 2 the Orama
adapter does this itself, so the engine was dropped; its runs stay in `data/runs/`.
Each indexes `title` and `body`, with a title boost of 2 where the engine has one
(Pagefind weights `<h1>` itself).

| config | meaning |
|---|---|
| stock | engine defaults, as the README shows them |
| tuned | the best the engine offers without extra code: its closest language option and typo tolerance. Orama `language: "arabic"` + `tolerance: 1`; MiniSearch `fuzzy: 0.2, prefix: true`; FlexSearch `tokenize: "forward"` + `suggest: true`; Lunr `lunr.ar`; Pagefind `forceLanguage: "ar"` |
| snowball | the naive fix: split on non-letters, Snowball 3.1.1 Persian stemmer, same at index and query time; the engine only splits on whitespace |
| fa-light | fa-search-kit `profile: "light"`: normalize + tokenize (rejoin spaced affixes); madda-less spelling indexed too |
| fa-standard | `profile: "standard"`: + Snowball with fa-search-kit's fixes (closed-suffix split, joined «می» rule, derivational suffixes kept, compounds' parts and the other half-space spelling indexed) |
| fa-full | `profile: "full"` + `fa-search-kit/lexicon`: + verbs, keep list, clitics, broken plurals; verb lemmas for Pagefind and FlexSearch, tense-keeping stems for MiniSearch, Orama and Lunr (bench/results/experiments.md, H10) |
| p1-light / p1-standard / p1-full | the same profiles through Phase 1's bench wiring (below); the Phase 2 gate's baseline |
| fa-rescue | fa-full + query rescue (`fa-search-kit/rescue`), as a site sets it up: in-browser engines call `rescue.addText` next to indexing and search through `rescueSearch`; Pagefind builds the word list while annotating (`words` option), fetches its pieces from memory, and asks the index itself whether a word is known (`pagefindKnows`). Each run also records, per query, the query searched instead and the word bytes it needed |

Since Phase 2 the fa-* configs run **through the shipped adapters** (`src/adapters/`),
as a site would set them up: Orama gets `faTokenizer()`, MiniSearch `faMiniSearch()`,
FlexSearch `faDocument()`, Lunr the `faLunr()` plugin and `fa.search()`, Pagefind pages
annotated by `faPagefindIndex().addPages()` (the page's own text + hidden terms) and
queries through `faPagefind().processQuery()`. Phase 1 fed each engine pre-analyzed
text with its own processing off (the `p1-*` configs; their runs are Phase 1's fa-*
runs, copied). Experiment arms vary one adapter option (bench/results/experiments.md,
"Phase 2").

The Phase 1 experiment arms (H1–H10) are recorded in `results/experiments.md` with
their exact options; their configs were removed once decided.

## Dev/test split

Every query of one target (canonical and all its variants) lands in the same half,
by a hash of the base id (`lib/split.ts`). Tuning is judged on **dev**; the
phase-end number is quoted from **test**, computed once.

## The gate: `compare.ts`

Per corpus × engine × variant type, paired on the same queries: an exact binomial
McNemar test on found/lost, and a Wilcoxon signed-rank test on reciprocal rank
(news recall sits near the ceiling for OR engines, so rank moves show first).
Benjamini–Hochberg across every test in one comparison. A cell **blocks** only if
q < .05 **and** recall or MRR drops by ≥ 2 points. It also reports an engine-free
**coverage** metric (share of queries whose terms are all among the target
document's terms), per-lemma macro recall for verb rows (a few verbs such as شد
dominate them), and lists every query that went from found to lost. Output:
`results/compare/<A>--<B>.<split>.md` (gitignored: it quotes query texts, which come
from CC BY-SA titles); exit code 1 when a cell blocks.

## Independent checks

- `conflation.ts`: UD Persian-Seraji and PerDT (hand-checked lemmas, CC BY-SA,
  evaluation only). Paice's under-stemming (UI: same-lemma form pairs left apart)
  and over-stemming (OI: different-lemma pairs merged) indices, on gold lemmas and
  on "verb families" (a verb's infinitive and participle lemmas folded into the
  verb, which search wants merged). Raw Snowball is the baseline to improve on.
- `collisions.ts`: vocabulary forms seen ≥ 50 times that a fold rule (or a config
  over another) makes identical, for review by hand.
- `excerpts.ts`: Pagefind excerpts under the adapter: how often Pagefind's own
  excerpt shows the hidden block of terms, and whether the one rebuilt by
  `processResult` marks a page word (`results/excerpts.md`).
- `rejoin.ts`: the rejoin rules on UD sentences, as written (every join is false)
  and with half-spaces typed as spaces (how many joins come back), per affix.

## Metrics

- **Recall@10**: share of queries whose target is in the top 10.
- **MRR@10**: mean of 1/rank, counting 0 when the target is outside the top 10.
- **Kept** (in the JSON): among queries whose canonical form was found, the share
  still found after the variant. It separates "the variant broke it" from "the query
  never worked".
- 95% Wilson intervals are in the JSON. Rows with fewer than 30 queries are left out.

## Known limits

- Known-item search tests recall of one known page. It cannot see precision
  problems such as merging opposites (the reason Snowball keeps نمی/ن). That needs
  graded judgements, a later addition.
- Queries are built from titles. Real queries also come from what people remember
  of the body, or from a need rather than a page.
- Variants are synthetic. They follow patterns documented in RESEARCH.md §6–8, but
  their mix is not the mix in a real query log; no public Persian query log exists.
  Rows are reported per type for that reason, and the summary's equal-weight mean is
  only a rough overview.
- The ان/ات plural and compound-word splitting («کتابخانه» / «کتاب خانه») are not
  generated yet: they need a lexicon to tell real plurals and compounds apart.
