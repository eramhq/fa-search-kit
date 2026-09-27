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
node bench/run.ts        # every engine × config; cached per run in bench/data/runs
node bench/report.ts --name baseline   # bench/results/baseline.{md,json}
```

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
- Rare types keep sampling extra ("supplementary") targets until they have 150
  queries or the corpus runs out. Supplementary targets appear only in their own
  variant rows, never in the canonical row.
- Everything is seeded (`SEED = 20260926`, plus a per-document, per-type sub-seed),
  so the query files are identical on every machine.
- Keyboard tables (`bench/lib/keyboards.ts`) were generated from the layouts
  themselves (Windows KLC exports, xkeyboard-config, and macOS via `UCKeyTranslate`),
  and the ISIRI 9147 standard's own PDF. Sources are listed in the file.

## Engines and configs

Engines: Pagefind 1.5.2 (real WASM search, run in Node through a fetch shim),
Orama 3.1.18, MiniSearch 7.2.0, FlexSearch 0.8.212, Lunr 2.3.9 (+ lunr-languages 1.22.0).
Each indexes `title` and `body`, with a title boost of 2 where the engine has one
(Pagefind weights `<h1>` itself).

| config | meaning |
|---|---|
| stock | engine defaults, as the README shows them |
| tuned | the best the engine offers without extra code: its closest language option and typo tolerance. Orama `language: "arabic"` + `tolerance: 1`; MiniSearch `fuzzy: 0.2, prefix: true`; FlexSearch `tokenize: "forward"` + `suggest: true`; Lunr `lunr.ar`; Pagefind `forceLanguage: "ar"` |
| snowball | the naive fix: split on non-letters, Snowball 3.1.1 Persian stemmer, same at index and query time; the engine only splits on whitespace |

Later phases add fa-search's own analyzer profiles as new configs.

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
