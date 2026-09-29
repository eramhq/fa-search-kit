# Phase 4b: an optional word-root model → a lemma list in the lexicon

**Decision (2026-09-28):**

- There is no `fa-search-kit/lemma` model.
- A plain list of 579 inflected forms ships inside `fa-search-kit/lexicon`
  (`src/lexicon/lemmas.ts`). It takes the lexicon from 7.83 to 10.83 KB gzipped (budget 15);
  the core is unchanged.
- Searching «نویسندگان», «بازیگران», «ستارگان» or «سخت‌تر» now finds pages with «نویسنده»,
  «بازیگر», «ستاره», «سخت».

Method, every number and the write-ups: bench/results/experiments.md, "Phase 4b".

## What was tried

The idea: a small model behind the lexicon predicts, for one word with no context, an
edit that gives its lemma's term, or defers. The lexicon always wins, and when the model
defers the output is fa-full's exactly (tested).

- **Labels (clean sources only).**
  - Mined from Hazm's verbs and our word counts (M). Only verbs (98% right against UD) and
    comparatives (97%) passed the bar.
  - Two AI families (gpt-6-luna and Claude) labelling 24,254 words of our own word list
    (L): agreement 91%, κ 0.82; accepted merges 95.8% right against UD. The ezafe ی and
    ات classes were under the 95% bar and dropped.
  - UD gold and Hazm's lemmatizer were comparison arms only.
- **Models.** A suffix-rule tree, a hashed n-gram linear model, and a plain list of the same
  gzipped size, at 5–50 KB.

## Results

| checkpoint | result |
|---|---|
| CP0 headroom | fa-full misses the target on ~10% of PerDT noun/verb tokens; the gold oracle lifts the lemma set's news nouns on Pagefind 58 → 96 and FlexSearch 43 → 96 (dev), but also raises treebank over-merging (the gold labels one form two ways) |
| CP2 models | at equal bytes the **list matches the tree** (5 KB: net +256 vs +250 UD dev tokens) with half the broken tokens; the linear model is behind everywhere. Pre-registered rule: more words beat a model → a lexicon experiment |
| CP3 conflation | PerDT noun under-stemming 42.4 → 37.9 (target ≥ 2 points: met); over-stemming within 0.4 ×10⁻⁶ (the strict gate "never higher" fails for any arm, the gold oracle included) |
| CP4 benchmark (dev) | main set 335 cells: 0 up, 0 down; lemma set: 3 up, 0 down |
| owner | tried recovering the ezafe ی (no rule clears 95% against UD; the disagreements are mostly UD conventions); the owner chose the smaller list without it |
| review | the list's added merges showed two real faults, both fixed before the test read: bare-word collisions («نامه‌ای» read as «نام‌های», «دست‌های» as «دسته‌ای») and a stop word («آنها» → «آن») |
| CP5 test (once) | main set 335 cells: **0 up, 0 down, 0 blocking**; lemma set 35 cells: **1 up, 0 down**; rescue false fixes unchanged (≤ 1 query in 150) |

Test split, lemma set, by the forms the list covers, on engines that need every word:

| forms | Pagefind | FlexSearch |
|---|---|---|
| «…ان/یان» plural | 83 → 90 | 63 → 77 |
| «…گان» plural | 100 → 100 | 38 → 75 |
| news nouns overall | 64 → 66 | 49 → 53 |

OR engines (Orama, MiniSearch, Lunr) already find these through the other query words: ±1.

UD test files, against fa-full: 325 tokens fixed, 131 broken (before the review fixes;
nouns 257 / 8). After them, UD dev is 310 fixed and 47 broken; what is left is defensible
(«اروپای» → «اروپا», the future «خواهم» → «خواست», which is UD's own lemma).

## What it does not do

- «ابتدای» → «ابتدا» (the ezafe ی: the largest gap, dropped by the owner's choice).
- «حملات» → «حمله» (ات: dropped, since its misses are real words such as «معلومات», «انتظامات»).
- Words outside the list: the list does not generalize, by design.
- Broken plurals that replace the whole word («ابیات» → «بیت»): they were in the labels but
  never fired in the tested arm, so they are left out of the shipped list. Four of them
  went into the hand-written broken-plural list instead (follow-ups, below).

## Benchmark bookkeeping

- `fa-full` and `fa-rescue` now include the list. Their runs before Phase 4b are kept as
  `fa-full-p3` and `fa-rescue-p3`, and the earlier experiment arms stay on that lexicon.
- The new `fa-full` runs are the `lm-list` runs, copied.
- `fa-rescue` on the main set is re-run.

## Follow-ups (2026-09-28)

Three small lexicon fixes, gated together against the lexicon as Phase 4b shipped it
(`fa-full-4b`; both lexicon versions are snapshotted in bench/lib/lexicons/):

1. The verb list drops «میزیدن» (میز) and «می‌راندن» (میران). Their stems start with «می», so
   the everyday «می‌زد», «می‌زند», «می‌راند» read as their forms («می‌زید»). The rule, in
   scripts/lib/mine.ts: drop a verb when most of its attested forms are «می» + another
   listed verb's form. It drops exactly these two; «مردن» (میر) stays.
2. Four broken plurals in `PLURALS`: «اجرام», «اذهان», «ابیات», «اوزان».
3. The 7 keep-list words the builder had produced since commit 5e87260 («میزگرد», «میبدی»…).

38 vocabulary words analyse differently. Benchmark, dev and test, main and lemma sets: 0
cells up or down, **0 queries found → lost**. Conflation: UI down 0.1–0.2 points on both
treebanks, OI unchanged. One wrong merge is added: «نمی‌زد» → «نزد», which is also «نزد»
("near"). It is the existing kept-negation term (ن + past stem), which «نزدند» and «نمی‌زنم»
already share. Query rescue with the shipped list against Phase 3 (test, `fa-rescue-p3 →
fa-rescue-4b`): 335 cells, 0 up, 0 down; false fixes unchanged. `fa-rescue` re-run with the fixes against `fa-rescue-4b`: dev and
test 0 up, 0 down, 0 queries found → lost; false fixes identical.
