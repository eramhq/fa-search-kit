# Phase 3: query rescue — results

> **Update (2026-09-28, Phase 3b, owner decision): suggest, don't replace.** A keyboard fix
> still replaces the search; a misspelling is now offered as a suggestion ("did you mean …?")
> with the results as typed, and replaces the search only when the words as typed find
> nothing. The tables below this box are for the first behaviour (every fix replaced the
> search, now arm R11); the new default's results are in "Phase 3b" at the end.

**Test split, computed once** at the end of the phase (2026-09-27), after all tuning on
dev. Tables: [phase3-test.md](phase3-test.md) (every cell, n and 95% intervals in
[phase3-test.json](phase3-test.json)), [rescue-test.md](rescue-test.md) (rescue at a glance);
decisions: [experiments.md](experiments.md), "Phase 3" (R1–R10); gates:
`compare/<A>--<B>.test.md` (not committed: they quote lost queries, fragments of CC BY-SA
titles; regenerate with `node bench/compare.ts <A> <B> --split test`).

## What shipped

All opt-in: a site that does not import these ships exactly what it shipped before (the
browser entries `fa-search-kit`, `/lexicon`, `/pagefind`, `/orama`, `/minisearch`,
`/flexsearch`, `/lunr` bundle byte for byte as in Phase 2; checked with esbuild against the
Phase 2 commit).

| entry | what | gzip |
|---|---|---:|
| `fa-search-kit/rescue` | `createRescue({ analyzer, words?, isKnown? })`: `addText`, `check`, `rescueSearch` for any engine; `fetchWords` for a built word list | core + 2.57 KB |
| `fa-search-kit/pagefind/rescue` | `rescuePagefindUI` (Pagefind UI wiring), `pagefindKnows` (is a word on the site, asked of Pagefind) | `/pagefind` + 3.05 KB (3.17 built) |
| `fa-search-kit/keyboard` | `keyboardCandidates(run)`: standard (ISIRI 9147), legacy Windows and legacy Mac layouts, both directions | 0.79 KB |
| `fa-search-kit/rescue/build` | `createWordList()`: the site's words in pieces (build time); CLI `--words` | build time |
| `fa-search-kit/analytics` | `canonicalKey(query)` for search logs | core + 0.07 KB |

How it decides, in short (README, "Query rescue"):
- **Weak search**: a query word the index does not know, or nothing found. "Known" is the
  index's answer, never the word list's: the terms `addText` collected for in-browser
  engines; for Pagefind, the top result of a probe search must contain a word that starts
  with each query term (a Latin term: the whole word), because Pagefind matches an unknown
  word through a shorter prefix and a result count says nothing.
- **Keyboard**: on the raw text (before normalizing, which would lose shifted keys), the one
  layout under which the most runs of the query become known words; short runs only with a
  long one as proof; a candidate must type a letter for every letter key.
- **Speller**: distance 1 over the site's own words, Persian-aware costs (sound-alike letters
  0.3, neighbouring keys 0.6, doubled letter 0.5, long vowel 0.8, swap 0.8, other 1); 3-letter
  words only a sound-alike swap; best by cost, then by how often the site uses the word; the
  fix is shown in the site's own most common spelling. When nothing is found and every word
  is known, the one word of the list whose close word the site uses ≥ 10× as often (R9).
- **Kept only if** the index knows the fixed word and the fixed search finds something.
- **Pagefind**: word list built from exactly the text Pagefind indexes (a hook in the
  annotator; nav, footer, `data-pagefind-ignore` and pages without `data-pagefind-body` left
  out), written next to Pagefind's folder in pieces keyed by the first letter's sound-alike
  class and word length, gzipped, names carrying a hash of the list; downloaded only by a weak
  search. Pagefind UI calls `processTerm` synchronously, so the first search is as typed, and
  the fix reruns the UI with a trailing space toggled (`triggerSearch` with the same text does
  nothing; checked in headless Chrome, also with a filter selected).

Budgets (`node scripts/size.ts`): keyboard ≤ 0.8 KB, rescue ≤ core + 2.6 KB (the plan said
2.5; every feature that pushes it over won its arm), rescue with the Pagefind wiring ≤
`/pagefind` + 3.2 KB (the built package adds `tsc`'s import-rewriting helper around one
dynamic `import()`), analytics ≤ core + 0.3 KB.

## The gate (test split)

| comparison | cells | up | down | blocking |
|---|---:|---:|---:|---:|
| fa-full → fa-rescue | 335 | 111 | 0 | **0** |
| stock → fa-rescue | 335 | 308 | 9 | 4 |

The four blocking cells against stock (wiki Pagefind canonical −0.6, wiki FlexSearch
zwnj-space −0.7, news MiniSearch verb-tense −1.0 and verb-negation −0.6, all MRR ≤ −4.8) are
Phase 2's: stock → fa-full blocks the same four plus five typo cells, which rescue removes.

## Target rows

Recall@10 in %, test split, **fa-full → fa-rescue**:

| row | Pagefind | Orama | MiniSearch | FlexSearch | Lunr |
|---|---|---|---|---|---|
| wiki homophone | 11 → 89 | 28 → 94 | 29 → 94 | 1 → 92 | 29 → 94 |
| wiki typo-adjacent | 15 → 84 | 25 → 90 | 24 → 90 | 1 → 86 | 24 → 89 |
| wiki typo-delete | 30 → 55 | 26 → 55 | 24 → 54 | 4 → 39 | 24 → 53 |
| wiki typo-transpose | 12 → 75 | 25 → 82 | 24 → 82 | 1 → 75 | 24 → 82 |
| wiki keyboard, standard layout | 0 → 93 | 1 → 82 | 1 → 83 | 0 → 83 | 1 → 83 |
| wiki keyboard, legacy Windows | 0 → 90 | 1 → 81 | 1 → 81 | 0 → 85 | 1 → 81 |
| wiki keyboard, legacy Mac | 0 → 70 | 1 → 72 | 1 → 73 | 0 → 66 | 1 → 72 |
| news homophone | 21 → 94 | 96 → 99 | 96 → 100 | 0 → 97 | 91 → 98 |
| news typo-transpose | 15 → 77 | 98 → 98 | 99 → 100 | 1 → 76 | 93 → 97 |
| news keyboard, standard layout | 0 → 95 | 0 → 99 | 0 → 100 | 0 → 79 | 0 → 98 |
| products homophone | 13 → 95 | 66 → 96 | 67 → 98 | 0 → 97 | 67 → 98 |
| products typo-transpose | 6 → 82 | 58 → 88 | 60 → 88 | 0 → 82 | 59 → 89 |
| products keyboard, standard layout | 0 → 92 | 13 → 90 | 13 → 91 | 0 → 82 | 13 → 91 |
| products Latin name typed on Persian | 19 → 93 | 49 → 98 | 49 → 98 | 0 → 94 | 49 → 98 |

At a glance (bench/results/rescue-test.md): mean of the four typo rows and of the keyboard
rows, fa-full → fa-rescue:

| corpus | engine | typo | typo MRR | keyboard | canonical |
|---|---|---|---|---|---|
| wiki | Pagefind | 17 → 76 | 12 → 69 | 0 → 84 | 99 → 99 |
| wiki | FlexSearch | 2 → 73 | 2 → 70 | 0 → 78 | 100 → 100 |
| wiki | MiniSearch | 25 → 80 | 16 → 72 | 1 → 79 | 100 → 100 |
| news | Pagefind | 23 → 81 | 21 → 78 | 0 → 92 | 100 → 100 |
| news | FlexSearch | 2 → 78 | 1 → 76 | 0 → 78 | 100 → 100 |
| news | MiniSearch | 98 → 99 | 87 → 95 | 0 → 99 | 100 → 100 |
| products | Pagefind | 16 → 83 | 14 → 75 | 5 → 89 | 100 → 100 |
| products | FlexSearch | 1 → 78 | 1 → 72 | 0 → 82 | 100 → 100 |
| products | MiniSearch | 62 → 89 | 42 → 78 | 22 → 92 | 100 → 100 |

(Orama and Lunr move with MiniSearch.) Canonical recall is unchanged in every cell.

## What it costs

- **Rows spelled correctly** are searched as a fix 0.3–1.7% of the time (clitic-add most;
  its recall held or rose, FlexSearch products 71 → 82).
- **Word bytes** a weak Pagefind search downloads, gzipped, for a cold visitor (manifest +
  pieces): products (20,000 short product pages) median 3.3 KB, p95 6.2 KB; news (20,000
  articles) 9.2 / 23.0 KB; wiki (20,000 long articles) 17.9 / 58.3 KB. Never on page load. The
  demo's 600 pages: 4.0 / 7.8 KB.
- **False fixes** (queries fine as typed but not on the site; % rewritten, Pagefind –
  in-browser engines):

  | | wiki | news | products |
  |---|---|---|---|
  | real words, ≥ 4 letters | 42 – 59 | 37 – 48 | 24 – 29 |
  | proper names (UD) | 37 – 47 | 39 – 47 | 32 – 39 |
  | inflected forms of site words | 29 – 34 | 22 – 27 | 25 – 27 |
  | 2–3-letter words | 5 – 10 | 3 – 7 | 4 – 6 |
  | Latin names and words | 3 | 3 – 5 | 0 – 2 |
  | tokens with digits | 0 – 1 | 0 | 0 |

  **Not ≈ 0, as the plan hoped**: a real word that is not on the site but is one edit from a
  site word looks exactly like a typo of it, and only the site's words are there to judge.
  That is the price of fixing automatically (the owner's decision); the notice and its "as
  typed" link are the remedy, and R1 (fix only when nothing is found) is the measured
  alternative for a site that would rather never rewrite: on Pagefind it cuts false fixes to
  0.7% at −8 points of typo recall (experiments.md). Typos of the first letter across
  sound-alike classes are not fixed (the pieces are split by first letter): typo-uniform
  (dev only, final code) rose less than the generator's typo rows: wiki Pagefind 10 → 54,
  FlexSearch 0 → 53, MiniSearch 26 → 64; products Pagefind 10 → 66, FlexSearch 0 → 60.
- **Time**: a search that is not weak costs the known-word checks only (in-browser: set
  lookups; Pagefind: one probe search and one fragment per new word, cached). A Pagefind run
  over 15,000 benchmark queries takes 5–10× longer with rescue, mostly probes for keyboard
  candidates that are not words; per visitor search that is a handful of probes.

## Engine-native typo tolerance (R4)

MiniSearch's `fuzzy: 0.2` passes the gate on its own and on top of rescue (wiki typo-delete
54 → 75, products 73 → 88 on dev), so the README recommends it; Orama `tolerance: 1` and
Lunr's edit distance 1 cost canonical recall 8–21 points and are not recommended. Pagefind and
FlexSearch have no edit-distance tolerance.

## Deviations from the plan

- Budgets: rescue 2.6 KB instead of 2.5; the Pagefind wiring with rescue 3.2 KB over
  `/pagefind` (see above).
- Known words on Pagefind: not "result count > 0" but a word of the top result starting with
  each query term (Latin terms: the whole word), because Pagefind matches unknown words by a
  shorter prefix (RESEARCH.md §14).
- The keyboard fix chooses one layout for the whole query (a per-run choice mixed layouts).
- Added R8–R10 (found in the first runs); R9 adopted. R5–R7 and the other options removed.
- Pagefind arms ran on products only (a Pagefind wiki or news run with rescue takes 40–90
  CPU-minutes); R9 on wiki and news is covered by this test-split gate.
- The analytics key prefix is `1:` (not tied to the package version string); a site passes
  its own prefix when it changes its analyzer.

## Phase 3b: suggest, don't replace (test split)

Gate `fa-full → fa-rescue`: 335 cells, **93 up, 0 down, 0 blocking**. Recall@10 in %,
fa-full → as shown (in brackets: found with one click on the suggestion, when it differs):

| row | Pagefind | Orama | MiniSearch | FlexSearch | Lunr |
|---|---|---|---|---|---|
| wiki homophone | 11 → 27 (89) | 28 → 91 (94) | 29 → 91 (94) | 1 → 92 | 29 → 91 (94) |
| wiki typo-adjacent | 15 → 28 (84) | 25 → 88 (90) | 24 → 88 (90) | 1 → 86 | 24 → 87 (89) |
| wiki typo-delete | 30 → 34 (55) | 26 → 54 (55) | 24 → 53 (54) | 4 → 39 | 24 → 53 |
| products typo-transpose | 6 → 73 (82) | 58 → 60 (88) | 60 → 61 (89) | 0 → 82 | 59 → 61 (89) |
| news keyboard, standard | 0 → 95 | 0 → 99 | 0 → 100 | 0 → 79 | 0 → 98 |
| wiki keyboard, legacy Mac | 0 → 70 | 1 → 72 | 1 → 73 | 0 → 66 | 1 → 72 |
| products Latin name on Persian | 19 → 93 | 49 → 98 | 49 → 98 | 0 → 94 | 49 → 98 |

- **Rows spelled correctly:** searched as a fix 0–0.7% of the time (was up to 1.7%), offered
  a suggestion 0–1.6%.
- **False fixes** (real words not on the site, names, Latin, digits, inflected forms; guard
  set): Pagefind **1.2 / 2.2 / 1.3%** (wiki / news / products; was 21.7 / 17.7 / 14.6%), the
  rest now suggestions. In-browser engines unchanged at 28.1 / 21.7 / 16.9%: a one-word query
  for a real word the site does not have finds nothing there, and then the fix applies (with the
  notice and the "as typed" link). Only suggesting, never replacing a spelling fix, would bring
  those to 0; it is a one-line policy change if wanted.
- **Why Pagefind differs:** it matches a typo'd word through a shorter prefix, so the typed
  query usually finds something and the fix becomes a suggestion. Its results for such queries
  also depend on earlier searches in the same visit (a Pagefind bug we reproduced on a plain
  English index and reported: https://github.com/Pagefind/pagefind/issues/1351).
- Word bytes per weak Pagefind search unchanged (3.3 / 9.2 / 17.9 KB median, products / news /
  wiki); keyboard rows identical to R11.
