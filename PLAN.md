# Plan: Persian Search Kit (new standalone project, working name `fa-search`)

## Context

Persian search on the web fails silently, and this is well documented.
- WordPress/WooCommerce users report that ي/ک mismatches return zero products (wp-parsi, wp-persian forums; freelancers get paid to fix it).
- OJS has an open bug where the half-space (ZWNJ) splits «می‌شود» apart (pkp-lib #13393).
- Triboon had to add wrong-keyboard-layout search (`nd[d` → «دیجی») after studying its users.

The user wants a **new project, separate from tiny-finglish**, that is useful for modern needs and not a copy of tinySarf. The research changed the plan in five ways:

- **Snowball already ships a Persian stemmer.**
  - Released in v3.1.0 (2026-05-22).
  - The JS build is about 1.3 KB gzipped and handles ي/ك, removes می‌/نمی‌, and guards words ending in ـان.
  - Don't write a new stemmer. Build what it **cannot** do (it has no word list/lexicon), and get it into the tools people use.
- **Pagefind** (v1.5.2) uses `pagefind_stem` (Snowball 3.0.x). It has **no Persian stemming**, no ي→ی or ك→ک folding, and no ZWNJ handling. Polish was added in PR #1032, which is a ready template to copy.
- **Orama** has a real bug: its Arabic tokenizer only keeps characters in the range `أ-ي`, so the Persian letters پ چ ژ ک گ ی are treated as word separators. lunr-languages, FlexSearch and MiniSearch ship nothing for Persian. Typesense and Algolia have no Persian stemming either.
- **Nobody has published numbers** on how badly browser/JS search fails on Persian. That is the research gap.
- **Semantic search in the browser:** transformer embedding models are 118 MB or more even when quantized. The only realistic small option is a custom Persian **Model2Vec** distillation, which I estimate at a few MB to 30 MB (not measured). Keep this experimental and optional.

**Goal:** Persian search that "just works" in JS, the browser and static sites.
- A symmetric analyzer that processes both the index and the query the same way: normalize, then split words, then stem, then a lexicon layer.
- Query rescue for the mistakes users actually make: wrong keyboard layout, typos, spellings that sound alike.
- Drop-in adapters for Pagefind, Orama, MiniSearch, FlexSearch and Lunr.
- Upstream PRs, so Pagefind and Orama users get Persian without installing anything.
- A public benchmark that proves each step helps.

## What users get (plain terms)
- **Site visitors:** they type the way they normally do (Arabic keyboard letters, no half-space, plural, a verb in another tense, the wrong keyboard layout, a sound-alike typo) and still find the page or product.
- **Developers and site owners:** `npm install`, one line of setup for Pagefind, Orama, MiniSearch, FlexSearch or Lunr, and a few KB of JS.
- **Everyone using Pagefind or Orama:** after the upstream PRs, Persian works with nothing extra to install.

## Stemmer strategy: build a better one, measured on search results
- "Better" means **more real matches without merging different words**, measured by the Phase 0 search benchmark, not by linguistic stemming accuracy.
- **Layer 1:** Snowball Persian as the fast rule-based base.
- **Layer 2:** our lexicon layer, which fixes what rules alone can't: past/present verb stems, مان/تان/شان, broken plurals, and words that must not be stemmed (ماهی ≠ ماه). This is the most likely win.
- **Layer 3 (experiment, only if layer 2 levels off):**
  - A tiny learned lemmatizer in the tinySarf style (a character-level model, ~20–50 KB) trained with Hazm/DadmaTools as the "teacher".
  - Scored against UD human-checked lemmas, evaluation only.
  - Check the license before shipping weights trained on CC BY-SA data.
- Rule fixes that don't need a lexicon go back upstream to Snowball, so everyone benefits.

## Principle: every "can't" or "don't" is a hypothesis to test
Nobody's explanation counts as a fact until we've measured it, including the Snowball maintainers', Lucene's and ours. Each gets tried on the benchmark, and the result decides. Starting list:

| Claim (source) | Our test |
|---|---|
| مان/تان/شان can't be told apart from the ان plural without a lexicon (Snowball) | Try a ZWNJ signal (`کتاب‌مان` has one, `زمان` doesn't), a ها/های context (`هایمان`), and a minimum stem length. Measure recall/precision against lexicon-only and against both |
| Strip می only when a ZWNJ follows it (Snowball) | Most people type `میروم` joined. Try "strip if the rest is a known verb stem" and compare |
| Don't strip negation ن/نمی, because it "merges opposites" (Snowball) | For **search**, someone typing `نمی‌خواهم` may want pages about `خواستن`. Measure it both ways, per profile |
| Syllable measure (R1) doesn't work for Persian (Snowball) | Retest with character-count and consonant-skeleton measures |
| ZWNJ becomes a space (Elasticsearch) / is stripped as a suffix (Lucene) | Compare three ways: space, keep the word whole, index both |
| Light stemming beats 4-grams by about 4.5% MAP (Dolamic & Savoy 2009, news text) | Re-run it on web and product text with modern variant queries |

Rules that win go into our layers and upstream to Snowball, with the evidence attached. Rules that lose get written up so nobody retries them blindly.

## Rust: only for the Pagefind PR
- The project itself is TypeScript/JS, with no Rust.
- Pagefind's core is Rust, so the upstream PR touches a little Rust:
  - generate `persian.rs` with the Snowball compiler;
  - add a feature flag, an enum entry, tests, and folding in `splitting.rs`.
- The Pagefind adapter in this repo works **without** that PR, using the Node API at build time plus `processTerm`.

## Step 0 (first thing after approval): create the project folder
- `mkdir ~/Documents/cc-projects/fa-search` and `git init`.
- Write:
  - `PLAN.md`: this plan.
  - `RESEARCH.md`: every research finding from this session with source URLs (Snowball Persian 3.1.0, Pagefind internals, the Orama tokenizer bug, datasets and licenses, keyboard layouts, user-pain evidence, embedding sizes), so the next session doesn't redo the work.
  - `CLAUDE.md`: a short project brief that points to PLAN.md and RESEARCH.md and states the "test every claim" principle.
- Memory for the new folder, at `~/.claude/projects/-Users-navidkashani-Documents-cc-projects-fa-search/memory/`:
  - Copy the two existing workflow memories (LLM workers with herdr/luna, luna budget).
  - Add a feedback memory: "Verify claims by experiment; don't accept a reason as true because an expert said it."
  - Update `MEMORY.md`.
- Then the user runs Claude in `fa-search/` to start Phase 0.

## Project setup
- New repo at `~/Documents/cc-projects/fa-search` (the name is a placeholder; check npm availability first). Nothing in tiny-finglish changes.
  - Checked 2026-09-26: `fa-search` is **taken** on npm (a Font Awesome icon search util, v1.0.4). `persian-search`, `farsi-search` and `fa-search-kit` were free. Pick the package name before the first publish; the folder name can stay.
- TypeScript, ESM, zero runtime dependencies. One package with subpath exports: `fa-search`, `/pagefind`, `/orama`, `/minisearch`, `/flexsearch`, `/lunr`, `/rescue`, `/lexicon`.
- Tooling: vitest for tests, `tsc` for the build, and Node 22+ scripts for data and the benchmark. Include a size-check script with Brotli/gzip budgets, following tiny-finglish's `scripts/size.ts` pattern.
- Vendor Snowball's generated `persian-stemmer.js` and `base-stemmer.js` (BSD-3) with a NOTICE file. Pin the Snowball version.
- **License hygiene:**
  - Ship only MIT/BSD/Apache data. Hazm's verb and word lists are MIT.
  - CC BY-SA and ODbL data (UD treebanks, Wikipedia, lemmatization-lists) are used for **evaluation only**, never bundled.

## Phases (each gated by benchmark numbers)

### Phase 0: Benchmark first (`bench/`)

**Status (2026-09-26): baseline done.** Harness, method and results: [bench/README.md](bench/README.md),
[bench/results/README.md](bench/results/README.md) (findings), [bench/results/baseline.md](bench/results/baseline.md) (tables).
Built: pinned fetch of Persian Wikipedia, pn-summary news and Digikala products (20k docs each,
evaluation only); 36,746 seeded known-item queries over 22 variant types (morphological forms
attested in 1.4M-type real text); Pagefind (real WASM, in Node), Orama, MiniSearch, FlexSearch,
Lunr × stock / tuned / Snowball configs. Headline: stock Orama and Lunr index no Persian; the
Arabic options of Orama and lunr-languages mangle پ چ ژ ک گ ی; Arabic ي/ك breaks every engine
that does index Persian (1–19% recall on wiki); wrong keyboard layout finds nothing anywhere;
Snowball fixes ي/ك, hamza and plurals but not آ, half-space-as-space, joined «میکند» (a regression
on AND engines), ezafe, clitics or digits: Phase 1's target rows.
Still open for Phase 0: graded relevance (precision, e.g. the negation hypothesis), an LLM
realism audit of a sample of variants (Claude + luna), ان/ات plurals and compound splitting.

- **Corpus:**
  - A Persian Wikipedia subset (CC BY-SA, evaluation only).
  - A product-title set: Digikala Kaggle dumps, after checking the license. Otherwise a synthetic catalog.
- **Queries:** "known-item" tests. Take words from a document's title and create realistic variants of them:
  - Arabic letters instead of Persian ones.
  - Half-space dropped, replaced with a space, or joined.
  - Plural or possessive endings (ها، ان، ‌ام، ‌مان…).
  - Verb forms (می‌روم ↔ رفتم).
  - Hamza/alef variants (هیئت/هیأت, مسئله/مسأله).
  - Wrong keyboard layout (ISIRI 9147, legacy Windows, Mac).
  - Sound-alike typos (ز/ذ/ض/ظ, س/ص/ث, ت/ط, ه/ح, ق/غ, ا/ع), following FarsTypo patterns.
- **Metrics:** recall@10 and MRR for each variant type, for each engine (Pagefind, Orama, MiniSearch, FlexSearch), across three configurations: stock, with the analyzer, and with the analyzer plus rescue.
- **Deliverable:** a baseline report. This is the "how broken is it" evidence that makes the case for everything else and for the upstream PRs.

### Phase 1: Core analyzer (`src/`)

**Status (2026-09-27): built and measured; not a clean pass of the gate.** Results:
[bench/results/phase1.md](bench/results/phase1.md) (test split, computed once),
decisions: [bench/results/experiments.md](bench/results/experiments.md). Profiles
`light` / `standard` / `full` in `src/`, core 4.95 KB gz, lexicon 7.83 KB gz. Against
Snowball, every target row rose (alef-madda FlexSearch 0–5 → 99–100, zwnj-join news
Pagefind 67 → 100, zwnj-space news FlexSearch 8 → 99, heh-yeh FlexSearch 0–16 → 100,
clitic-add FlexSearch 9–14 → 74–87, verb-tense news FlexSearch 12 → 93, digits → 100),
and over-stemming fell (fa-standard below Snowball on UD in every view). Remaining
blocking cells: Orama news ranking (its default prefix matching, verified in code; fix
in the Phase 2 adapter), products zwnj-join MRR (the «قهوه‌ای»/«قهوهای» ambiguity), two
Pagefind products typo cells (Phase 3). Claims tested: H1, H2, H3, H5, H7 and three
found on the way (H5b spelling alternatives, H8 derivational suffixes, H10 verb lemmas
per engine type). Still open: H4 (R1 minimums, needs a Snowball fork) and H6 (4-grams),
negation precision (needs graded judgments), package name.
- **`normalize(text)`** with an offset map, so search highlights still point at the original text:
  - Map ي/ى to ی, ك to ک, ة to ه, and fold ۀ/هٔ/ه‌ی.
  - Fold alef and hamza forms.
  - Convert Persian, Arabic and Latin digits to one form.
  - Remove harakat (short-vowel marks), tatweel, ZWJ, LRM/RLM and presentation forms.
  - Reduce stretched letters (سلامممم).
- **`tokenize`** that treats half-space, space and joined spellings as the same word:
  - Keep ZWNJ-marked words as one token.
  - Rejoin known prefixes and suffixes written with a space (`می روم`, `کتاب ها`).
  - Offer the joined form as an alternative (`میروم`).
  - Follow the Hazm rule list, including exceptions like میهن and میراث.
- **`stem`**: the Snowball Persian stemmer, with our normalization running first so ZWNJ survives for its prefix detection.
- **Lexicon layer** (`/lexicon`, optional, ~10–15 KB gzipped budget), covering what Snowball can't do without a word list:
  - Map present verb stems to past stems (رو→رفت, کن→کرد) using Hazm's MIT verb list.
  - Strip مان/تان/شان only when the remainder is a known word.
  - Arabic broken plurals (کتب→کتاب), from a curated short list.
  - An exception list for over-stemming, e.g. ماهی (fish) ≠ ماه (moon/month).
- **Analyzer profiles:** `light` (normalize only), `standard` (+ stem), `full` (+ lexicon). All use the same function at index time and query time.
- **Size budgets:** core (normalize + tokenize + stem) ≤ 5 KB gzipped; lexicon ≤ 15 KB.

### Phase 2: Adapters and demo

**Status (2026-09-27): built and measured; the gate passes apart from two cells each
explained by an experiment decision.** Package `fa-search-kit` (not published):
adapters for Orama, MiniSearch, FlexSearch, Lunr and Pagefind (browser side
`/pagefind`, build side `/pagefind/build` + CLI), each ≤ core + 0.6 KB gzipped; smoke
test of the packed tarball (`scripts/smoke-pack.ts`). The benchmark now measures the
shipped adapters: [bench/results/phase2.md](bench/results/phase2.md) (test split, once),
decisions P1–P4 in [bench/results/experiments.md](bench/results/experiments.md). Against
Phase 1's wiring 57–62 cells up; blocking only wiki Orama typo-delete (the sentinel,
P3; typos are Phase 3) and products Pagefind std-typing (P1: the page's own text must
stay, Pagefind's length and prefix scoring favour pages typed in standard Persian;
−5.5 on test, 25 → 83 vs stock). Orama's Phase 1 blocker is fixed (products canonical
86 → 97). Pagefind layout found by experiment: all index terms in a hidden block, the
title's terms as Pagefind's title meta, normalized spellings of words Pagefind reads
differently; `processResult` rebuilds excerpts and restores titles. Demo in `demo/`
(600 real pages, two Pagefind indexes, replay: stock 60% → 98%), checked headless;
the in-browser check is pending. Deviations from the plan: the Pagefind adapter is two
entries (the HTML annotator is build-time only, 1.9 KB, over the browser budget); the
vendored Snowball files are copied into `dist/`, not compiled with `allowJs` (their
Closure-style JSDoc does not type-check).
- **`/pagefind`:**
  - A build step that uses the Node API `addCustomRecord`, or injects a `hidden` span of stems with `data-pagefind-weight` (Pagefind indexes hidden elements; confirmed in `parser.rs`).
  - A `processTerm` hook for Pagefind UI.
- **`/orama`:** a custom tokenizer that fixes the Arabic character-range bug.
- **`/minisearch`:** `tokenize` and `processTerm`.
- **`/flexsearch`:** an Encoder with a mapper and stemmer.
- **`/lunr`:** a pipeline function.
- **Demo:** a static site (Astro or Hugo) with a Persian blog and product catalog, showing side-by-side "stock vs fa-search" search boxes that replay the benchmark queries.

### Phase 3: Query rescue (`/rescue`)

**Status (2026-09-28): built and measured; the gate passes.** Results:
[bench/results/phase3.md](bench/results/phase3.md) (test split, computed once), decisions
R1–R10 in [bench/results/experiments.md](bench/results/experiments.md). All opt-in, new
entries only (core and existing browser adapters bundle byte-identical):
`fa-search-kit/rescue` (core + 2.57 KB), `/pagefind/rescue` (Pagefind UI wiring and
`pagefindKnows`), `/keyboard` (0.79 KB), `/rescue/build` + CLI `--words`, `/analytics`
(`canonicalKey`, core + 0.07 KB). fa-full → fa-rescue on test: 111 cells up, 0 down, 0
blocking; e.g. wiki homophone Pagefind 11 → 89, FlexSearch 1 → 92; keyboard (standard
layout) 0 → 79–100 on every engine; products Latin-on-Persian 19–49 → 93–98. Rows spelled
correctly are rewritten 0.3–1.7% of the time; a weak Pagefind search downloads a median
3.3–17.9 KB of word pieces (products → wiki, 20k pages each). Known cost: **false fixes of real
words that are not on the site, 24–59%** (names 32–47%; Latin 0–5%, digits ≈ 0), measured by a
new guard set; R1 (fix only when nothing is found) is the documented low-rewrite alternative.
Adopted: unknown-word trigger, Persian-aware costs at distance 1, one keyboard layout per
query, suspects when nothing is found (R9); MiniSearch's own `fuzzy: 0.2` recommended.
Rejected with numbers: empty-only trigger, plain costs (but it wins typo-uniform by 2–7
points), sound-alike index key, distance 2, min count 2, 3-letter edits, cheap edits only;
Orama/Lunr native tolerance. Deviations: budgets rescue 2.6 KB (plan 2.5) and wiring 3.2 KB;
Pagefind "known" is a word of the top result, not a result count (Pagefind matches unknown
words by prefix). Demo: rescue in the fa box with notice, "as typed" link and KB downloaded;
replay 28% → 93% (85% as shown once misspellings became suggestions, Phase 3b); browser-checked (no-op `triggerSearch`, rerun with a filter, one pagefind.js
instance). Open: first-letter typos across sound-alike classes; a way to tell unknown real
words from typos without a big dictionary.

**Phase 3b (2026-09-28, owner decision): suggest, don't replace.** A keyboard fix still
replaces the search; a misspelling is a suggestion ("did you mean …?") unless the words as
typed find nothing. Test: fa-full → fa-rescue 93 up, 0 down, 0 blocking; "one click" recall
equals the replace behaviour (arm R11) everywhere; false fixes on Pagefind 15–22% → 1–2%
(now suggestions); in-browser engines unchanged at 17–28% (one-word queries for words the site
lacks find nothing, so the fix applies); rows spelled correctly rewritten 0–0.7%. Live demo:
https://eramhq.github.io/fa-search-kit/ (gh-pages branch).
- **Keyboard layout:**
  - Mapping tables for ISIRI 9147, legacy Windows KBDFA and Mac, in both directions.
  - Detect the mistake with a character n-gram "does this look like Persian or English?" score (the Rekey/Punto approach).
  - Plus a **zero-results retry**, the way the Yandex browser does it.
- **Fuzzy matching built from the site's own vocabulary:**
  - A SymSpell-style delete index built at index time from the site's own words, so it stays small.
  - Persian-aware edit costs: sound-alike letter groups cost less than other substitutions.
  - A **Persian sound-alike key**, similar to Soundex, that folds the sound-alike groups, as a last-resort match.
- **"Did you mean":** always keep the original query; only suggest or retry when results are weak or empty.
- **Search-log grouping:** a `canonicalKey(query)` function so analytics can merge variants of the same query into one row.

### Phase 4: Upstream contributions (only with benchmark evidence attached)

**Status (2026-09-28): started.** Pagefind: proposal for Persian support (Snowball stemmer,
ZWNJ compound parts, ۀ fold) opened as https://github.com/Pagefind/pagefind/issues/1352,
waiting for the maintainers' answer before the PR; a core bug found on the way (results for a
query with an unknown word depend on earlier searches, reproduced on an English index) opened
as https://github.com/Pagefind/pagefind/issues/1351. Orama: the Arabic splitter bug (also
breaks Arabic آ/ء/vowelled text) with a tested one-line fix,
https://github.com/oramasearch/orama/issues/1043. Snowball: derivational over-stemming with UD
conflation numbers, plus the ـته/ـده, ۀ and joined-«می» questions,
https://github.com/snowballstem/snowball/issues/304. lunr-languages: an open 2024 PR (#109)
already adds `lunr.fa`; we benchmarked it (dev: behind Snowball on most rows, ahead on آ→ا)
and commented with numbers and an offer to help rebase it on Snowball,
https://github.com/MihaiValentin/lunr-languages/pull/109#issuecomment-5864755418. The repo is
not public, so all of these carry their numbers inline.
- **Pagefind:**
  - Add Persian to `pagefind_stem`, generated from Snowball 3.1.x, copying PR #1032.
  - Add ي/ك folding and ZWNJ handling in `fossick/splitting.rs`.
  - Update the multilingual docs table.
- **Orama:** fix the tokenizer regex, and add the fa stemmer to `@orama/stemmers`.
- **lunr-languages:** add `lunr.fa` (a stemmer, stop words and tests, per their CONTRIBUTING).
- **Snowball:** send test cases and fixes found by the benchmark to `persian.sbl` and snowball-data. The maintainers require written reasons for every rule, and they rejected stripping negation prefixes.

### Phase 4b (experimental, gated): learned lemmatizer (stemmer layer 3) — **done (2026-09-28): a word list, not a model**
- Train the tiny character-level model on teacher labels. Compare three setups on the benchmark: Snowball alone, Snowball + lexicon, and Snowball + lexicon + model.
- Ship it as an optional `/lemma` entry only if it wins on recall **and** precision within about 50 KB.
- **Outcome** ([bench/results/phase4b.md](bench/results/phase4b.md)):
  - The pre-registered rule applied: at equal size, a plain list of words matched the suffix tree and beat the linear model, with half the wrong merges. So there is no `/lemma` entry.
  - The list ships inside `fa-search-kit/lexicon`: 579 words, lexicon 7.83 → 10.83 KB.
  - Labels: two AI families agreeing on our own word list, plus Hazm verbs.
  - The ezafe ی and ات labels were dropped; the owner chose the smaller list.
  - Test split: no benchmark cell down; plural searches up on Pagefind and FlexSearch.

### Phase 5 (experimental, gated): hybrid semantic search
- Distill a Persian-vocabulary int8 **Model2Vec** model from a Persian-capable teacher (Tooka-SBERT or multilingual-e5), with a target of ≤ 30 MB.
- Plug it into Orama's `hybrid` mode.
- **Ship only if** the benchmark (plus FaMTEB and msmarco-fa retrieval subsets) shows a clear gain over the lexical analyzer at that size. Otherwise, document the negative result.

## Out of scope for v1
- A WordPress/PHP plugin. It becomes possible later by porting `normalize` and using Snowball's other output languages.
- Finglish (that's tiny-finglish's job).
- Transformer embeddings in the browser (118 MB and up).
- Server engines (Lucene and Meilisearch already have Persian analyzers).

## Verification
- `vitest`: table-driven variant pairs, e.g. every variant of «کتاب‌هایمان» / «می‌روم» / «كيف» must produce the same analyzed terms as its canonical form. Also offset-map round trips, and keyboard-layout conversions in both directions.
- `node bench/run.ts`: the recall@10/MRR table per variant type × engine × configuration. Every phase has to improve its target rows without regressing the others.
- `node scripts/size.ts`: enforce the gzipped/Brotli budgets for each entry point.
- End-to-end: build the demo, run `npx pagefind --site dist`, and replay the benchmark queries in a browser against both stock and fa-search indexes.
- Upstream PRs: run each project's own test suite, plus our benchmark numbers attached to the PR.
