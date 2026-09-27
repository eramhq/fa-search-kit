# Baseline findings (Phase 0)

Run of 2026-09-26: 3 corpora × 20,000 documents, 36,746 known-item queries
(1,000 canonical per corpus plus up to 22 variant types), 5 engines × 3 configs.
Full tables: [baseline.md](baseline.md); every number with n, 95% intervals and
MRR: [baseline.json](baseline.json). Method: [../README.md](../README.md).

Numbers below are recall@10 in %. "Variant mean" = mean over variant types, each
type weighted equally (a rough overview; read the per-type rows).

## 1. Two of the five engines index no Persian at all out of the box

| canonical query, stock | wiki | news | products |
|---|---:|---:|---:|
| Orama 3.1.18 | 0 | 0 | 12 |
| Lunr 2.3.9 | 0 | 0 | 12 |
| Pagefind, MiniSearch, FlexSearch | 100 | 100 | 100 |

The 12% on products is queries that contain a Latin model code or a number; the
Persian words themselves are never indexed. Causes, verified in the code and by
running the tokenizers (RESEARCH.md §4): Orama's default splitter keeps only
`A-Za-z0-9` and a few Latin accents; Lunr's trimmer strips `\W`, which is every
non-ASCII letter.

## 2. Their "Arabic" options make it only partly better, because they break Persian letters

| canonical query, tuned (Arabic option) | wiki | news | products |
|---|---:|---:|---:|
| Orama `language: "arabic"` | 34 | 29 | 25 |
| Lunr `lunr.ar` | 62 | 77 | 58 |

Orama's Arabic splitter treats پ چ ژ ک گ ی as separators («گوشی» → «وش»); lunr.ar's
trimmer cuts the same letters off word edges («کتاب» → «تاب»). Both are small
regex fixes upstream.

## 3. Engines that do index Persian still miss everyday spelling differences

Stock, wiki corpus (1–2 word queries, so one changed word matters):

| variant | Pagefind | MiniSearch | FlexSearch |
|---|---:|---:|---:|
| arabic-yk (ي/ك typed) | 4 | 19 | 1 |
| hamza (رئیس/رییس, تأثیر/تاثیر) | 42 | 69 | 28 |
| alef-madda (آ typed as ا) | 98 | 31 | 3 |
| zwnj-join (half-space left out) | 100 | 30 | 10 |
| zwnj-space (half-space typed as space) | 45 | 50 | 100 |
| plural-add | 38 | 78 | 63 |
| clitic-add | 10 | 73 | 2 |
| homophone (ز/ذ/ض/ظ …) | 7 | 31 | 1 |
| any wrong keyboard layout | 0 | 0–1 | 0 |

- **Arabic ي/ك is the worst everyday failure**: 1–19% on wiki, 0–59% on news, for
  the engines that index Persian at all. It is also the most reported problem in the
  field (RESEARCH.md §6).
- **Pagefind** already folds آ/أ/ؤ and ignores the half-space, and its prefix
  matching covers dropped plurals, but it has no ي/ك folding. Because it requires
  every query word to match, one misspelled word loses the page (typos 4–23%).
- **FlexSearch** also requires every word by default and splits on the half-space,
  so «کتابها» never matches «کتاب‌ها». `suggest: true` fixes most of that (news
  variant mean 14 → 80).
- **MiniSearch** is the most forgiving (it matches any word), and with `fuzzy: 0.2`
  it is the best off-the-shelf option (wiki variant mean 73). It still has no
  Persian normalization: arabic-yk is 83% even with fuzzy matching on, 19% without.
- **Wrong keyboard layout finds nothing in any engine, config or corpus** (0–1%;
  the 3–13% on products is Latin model codes that survive). Only a query-rescue
  layer can fix it.

## 4. Plugging in Snowball's Persian stemmer helps a lot, and leaves clear gaps

Variant mean, stock → snowball:

| | wiki | news | products |
|---|---:|---:|---:|
| Pagefind | 31 → 51 | 31 → 50 | 40 → 55 |
| Orama | 0 → 53 | 0 → 75 | 12 → 53 |
| MiniSearch | 41 → 60 | 79 → 84 | 48 → 64 |
| FlexSearch | 21 → 40 | 14 → 30 | 11 → 31 |
| Lunr | 1 → 59 | 0 → 81 | 12 → 64 |

What Snowball fixes: arabic-yk, hamza and plural-add reach 87–100% on every engine
and corpus (one exception: hamza with Orama on products, 64). plural-drop and
zwnj-add improve on wiki and news, less on products (44–92).

What it leaves broken. These are **Phase 1's target rows**, each with the mechanism
checked on the stemmer itself:

| gap | evidence (snowball config) | cause |
|---|---|---|
| alef-madda | wiki: MiniSearch 29, FlexSearch 2, Lunr 28 | no آ → ا folding |
| zwnj-join on verbs | news: Pagefind **100 → 64**, FlexSearch 63 | «می‌کند» → «کند», but «میکند» stays «میکند». Snowball strips می only after a ZWNJ. On AND engines this is a **regression** against stock. First data point for PLAN.md's "strip می only after ZWNJ" hypothesis. |
| zwnj-space | 1–92; worst on AND engines (FlexSearch 1–29, Pagefind 14–45) | «می کند» / «کتاب ها» are two tokens; no rejoining |
| heh-yeh | FlexSearch 14 / 0, Pagefind 45–67 | «نامه‌ی» → «نامهی» (ZWNJ deleted, ی kept) |
| clitic-add | wiki: Pagefind 24, FlexSearch 12 | «کتابش» unchanged (clitics not stripped; مان/تان/شان deliberately) |
| digits | wiki: Pagefind 13, FlexSearch 11; products: 30 / 0 | no digit folding (۳۰ ≠ 30) |
| verb-tense / verb-negation | news, AND engines: Pagefind 28 / 6 | no present ↔ past stem mapping; نمی/ن kept |
| typos, homophones, layouts | unchanged from stock | out of scope for a stemmer: Phase 3 (rescue) |

## 5. Cost

Typo tolerance is expensive on real Persian vocabularies: Orama `tolerance: 1` took
0.46–0.62 s per query on the 20k-doc wiki and news indexes (vs 3–6 ms with
Snowball), and MiniSearch `fuzzy: 0.2` took 11–13 ms (vs < 1–3 ms). Timings are
from parallel runs on a laptop; treat them as relative, not absolute.

## Reading the numbers carefully

- **News rows are close to the ceiling for engines that match any word** (MiniSearch,
  tuned FlexSearch). News queries have 3–5 words and a variant changes one of them,
  so the other words still find the page. The effect shows in MRR (news MiniSearch
  stock: variant MRR 70 vs recall 79), and plainly in Pagefind, which needs every
  word. Use wiki and products rows, and MRR, to judge analyzer changes.
- Known-item recall cannot see precision damage such as merging opposites (the
  reason Snowball keeps نمی). A graded-relevance set is needed before deciding
  PLAN.md's negation hypothesis.
- Orama's ranking with a whitespace tokenizer has an unexplained quirk (a common
  word outscoring a rare one, RESEARCH.md §4): its snowball canonical recall is
  86–98% (MRR 64–86), where the other engines reach 99–100%. Investigate in the Phase 2 adapter before blaming the analyzer.
