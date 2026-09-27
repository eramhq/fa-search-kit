# Phase 1: the core analyzer — results

**Test split, computed once** at the end of the phase (2026-09-27), after all tuning
on dev. Tables: [phase1-test.md](phase1-test.md) (every cell, n, 95% intervals in
[phase1-test.json](phase1-test.json)); gates: `compare/<A>--<B>.test.md` (not committed: they quote every lost query, and the
queries are fragments of CC BY-SA titles; regenerate with `node bench/compare.ts <A> <B> --split test`);
experiments and decisions: [experiments.md](experiments.md).

fa-search now has its own analyzer in `src/`: normalize → tokenize (rejoin spaced
affixes) → Snowball 3.1.1 wrapped with fixes → optional lexicon. Three profiles:

| profile | what | size (gzip) |
|---|---|---:|
| `light` | normalize + tokenize; indexes half-space segments and the madda-less spelling | core 4.95 KB (all profiles share it) |
| `standard` | + Snowball: closed-suffix split at ZWNJ, joined «می» rule, derivational suffixes kept, index-time spelling alternatives (compound parts, other half-space spelling, no madda) | same |
| `full` | + `fa-search/lexicon`: Hazm verbs (present → past stems), keep list of 1,040 look-alike words, joined clitics, 103 broken plurals | + 7.83 KB |

Budgets: core ≤ 5 KB, lexicon ≤ 15 KB (`node scripts/size.ts`; esbuild with UTF-8
output, as `tsc` emits the package; note the vendored Snowball file keeps `\u`
escapes in source, so a bundler that writes ASCII output would add about 1 KB).

## Target rows

Recall@10 in %, test split, each cell **stock → snowball → fa-standard → fa-full**.
`orama-exact` is Orama with prefix matching switched off by a term sentinel (see
"Orama" below); stock configs index no Persian on Orama/Lunr, hence the zeros.
fa-full uses verb lemmas on Pagefind and FlexSearch and tense-keeping stems on the
any-word engines (H10).

**wiki** (recall@10 %, test split; stock → snowball → fa-standard → fa-full)

| type | n | pagefind | flexsearch | minisearch | lunr | orama | orama-exact |
|---|---:|---|---|---|---|---|---|
| canonical | 500 | 100 → 100 → 99 → 99 | 100 → 100 → 100 → 100 | 100 → 100 → 100 → 100 | 0 → 100 → 100 → 100 | 0 → 97 → 97 → 97 | 0 → 100 → 100 → 100 |
| alef-madda | 146 | 99 → 98 → 98 → 98 | 5 → 5 → 100 → 100 | 31 → 31 → 100 → 100 | 0 → 31 → 100 → 100 | 0 → 18 → 91 → 90 | 0 → 29 → 99 → 99 |
| hamza | 100 | 46 → 86 → 86 → 86 | 30 → 87 → 87 → 87 | 69 → 94 → 93 → 92 | 1 → 94 → 93 → 92 | 0 → 88 → 85 → 85 | 0 → 93 → 91 → 91 |
| heh-yeh | 148 | 39 → 43 → 100 → 100 | 36 → 16 → 100 → 100 | 97 → 97 → 100 → 100 | 1 → 95 → 99 → 99 | 0 → 81 → 96 → 96 | 0 → 97 → 99 → 99 |
| digits | 85 | 11 → 9 → 100 → 100 | 8 → 7 → 100 → 100 | 64 → 64 → 100 → 100 | 5 → 64 → 100 → 100 | 6 → 41 → 88 → 88 | 6 → 67 → 100 → 100 |
| zwnj-space | 153 | 50 → 48 → 96 → 96 | 100 → 34 → 99 → 99 | 50 → 52 → 99 → 99 | 0 → 54 → 99 → 99 | 0 → 57 → 82 → 81 | 0 → 36 → 93 → 93 |
| zwnj-join | 153 | 100 → 99 → 100 → 100 | 8 → 99 → 100 → 100 | 27 → 100 → 100 → 100 | 0 → 100 → 99 → 99 | 0 → 99 → 99 → 99 | 0 → 100 → 100 → 100 |
| plural-add | 141 | 35 → 97 → 98 → 98 | 67 → 97 → 99 → 99 | 78 → 99 → 99 → 99 | 0 → 99 → 99 → 99 | 0 → 94 → 95 → 94 | 0 → 98 → 99 → 99 |
| plural-drop | 148 | 97 → 95 → 95 → 94 | 81 → 95 → 98 → 97 | 70 → 97 → 97 → 97 | 0 → 97 → 96 → 95 | 0 → 82 → 84 → 84 | 0 → 95 → 95 → 95 |
| clitic-add | 151 | 12 → 21 → 23 → 76 | 3 → 9 → 13 → 74 | 75 → 72 → 74 → 86 | 0 → 72 → 73 → 87 | 0 → 65 → 66 → 78 | 0 → 72 → 75 → 86 |
| combo | 156 | 10 → 77 → 98 → 97 | 13 → 59 → 99 → 99 | 26 → 80 → 99 → 99 | 0 → 81 → 98 → 98 | 0 → 72 → 90 → 90 | 0 → 77 → 97 → 97 |

**news** (recall@10 %, test split; stock → snowball → fa-standard → fa-full)

| type | n | pagefind | flexsearch | minisearch | lunr | orama | orama-exact |
|---|---:|---|---|---|---|---|---|
| canonical | 500 | 100 → 100 → 100 → 100 | 100 → 100 → 100 → 100 | 100 → 100 → 100 → 100 | 0 → 99 → 99 → 99 | 0 → 98 → 97 → 97 | 0 → 100 → 100 → 100 |
| alef-madda | 146 | 99 → 100 → 100 → 100 | 1 → 0 → 100 → 100 | 97 → 97 → 100 → 100 | 1 → 90 → 99 → 99 | 1 → 76 → 95 → 96 | 1 → 94 → 100 → 100 |
| hamza | 148 | 14 → 89 → 89 → 89 | 10 → 87 → 87 → 88 | 99 → 100 → 100 → 100 | 0 → 99 → 99 → 99 | 0 → 97 → 95 → 95 | 0 → 99 → 100 → 100 |
| heh-yeh | 147 | 54 → 63 → 100 → 100 | 37 → 0 → 100 → 100 | 99 → 97 → 100 → 100 | 1 → 92 → 99 → 99 | 1 → 84 → 97 → 97 | 1 → 95 → 99 → 99 |
| digits | 71 | 92 → 89 → 100 → 100 | 0 → 0 → 100 → 100 | 94 → 97 → 100 → 100 | 0 → 87 → 100 → 100 | 0 → 77 → 100 → 100 | 0 → 94 → 100 → 100 |
| zwnj-space | 175 | 21 → 29 → 99 → 99 | 100 → 8 → 99 → 99 | 88 → 92 → 100 → 100 | 1 → 91 → 98 → 98 | 1 → 79 → 95 → 97 | 1 → 91 → 100 → 100 |
| zwnj-join | 175 | 99 → 67 → 100 → 99 | 0 → 66 → 100 → 100 | 91 → 100 → 100 → 100 | 1 → 99 → 100 → 100 | 1 → 97 → 95 → 96 | 1 → 100 → 100 → 100 |
| zwnj-add | 147 | 15 → 100 → 100 → 100 | 20 → 99 → 99 → 99 | 97 → 99 → 99 → 99 | 0 → 99 → 98 → 98 | 0 → 95 → 96 → 95 | 0 → 99 → 99 → 99 |
| plural-add | 222 | 24 → 99 → 100 → 99 | 37 → 99 → 99 → 99 | 98 → 100 → 100 → 100 | 0 → 99 → 98 → 98 | 0 → 96 → 95 → 96 | 0 → 100 → 99 → 99 |
| plural-drop | 148 | 99 → 100 → 100 → 100 | 75 → 97 → 99 → 99 | 97 → 99 → 99 → 99 | 0 → 99 → 99 → 99 | 0 → 96 → 96 → 97 | 0 → 99 → 99 → 99 |
| clitic-add | 158 | 42 → 46 → 49 → 91 | 1 → 14 → 18 → 87 | 97 → 98 → 97 → 99 | 1 → 96 → 94 → 98 | 1 → 85 → 82 → 94 | 1 → 96 → 97 → 99 |
| verb-tense | 198 | 22 → 28 → 28 → 97 | 11 → 12 → 13 → 93 | 99 → 99 → 98 → 98 | 1 → 98 → 96 → 96 | 1 → 92 → 87 → 87 | 1 → 98 → 98 → 97 |
| verb-tense-ud | 153 | 8 → 43 → 43 → 82 | 5 → 26 → 27 → 78 | 98 → 99 → 97 → 97 | 0 → 97 → 95 → 96 | 0 → 89 → 86 → 86 | 0 → 98 → 96 → 95 |
| verb-negation | 176 | 7 → 9 → 8 → 13 | 5 → 5 → 5 → 8 | 99 → 100 → 99 → 99 | 1 → 98 → 95 → 96 | 1 → 93 → 91 → 81 | 1 → 98 → 97 → 95 |
| combo | 339 | 11 → 67 → 99 → 99 | 6 → 45 → 98 → 98 | 52 → 97 → 100 → 100 | 0 → 96 → 99 → 99 | 0 → 90 → 96 → 97 | 0 → 96 → 100 → 100 |

**products** (recall@10 %, test split; stock → snowball → fa-standard → fa-full)

| type | n | pagefind | flexsearch | minisearch | lunr | orama | orama-exact |
|---|---:|---|---|---|---|---|---|
| canonical | 500 | 100 → 100 → 100 → 100 | 100 → 100 → 100 → 100 | 100 → 100 → 100 → 100 | 13 → 100 → 100 → 100 | 13 → 86 → 86 → 86 | 13 → 97 → 97 → 97 |
| alef-madda | 137 | 100 → 100 → 99 → 99 | 2 → 0 → 99 → 99 | 61 → 60 → 99 → 99 | 9 → 59 → 99 → 99 | 8 → 43 → 80 → 80 | 8 → 54 → 93 → 94 |
| std-typing | 110 | 25 → 83 → 88 → 88 | 7 → 70 → 91 → 90 | 23 → 69 → 88 → 88 | 2 → 70 → 88 → 88 | 2 → 43 → 55 → 56 | 2 → 70 → 87 → 87 |
| hamza | 68 | 47 → 96 → 96 → 96 | 0 → 96 → 96 → 96 | 62 → 97 → 97 → 97 | 44 → 97 → 97 → 97 | 43 → 72 → 75 → 75 | 43 → 85 → 82 → 82 |
| heh-yeh | 150 | 66 → 64 → 100 → 100 | 33 → 0 → 100 → 100 | 93 → 92 → 100 → 100 | 28 → 92 → 100 → 100 | 25 → 80 → 97 → 96 | 25 → 90 → 98 → 98 |
| digits | 151 | 36 → 33 → 100 → 100 | 0 → 0 → 100 → 100 | 71 → 70 → 100 → 100 | 0 → 70 → 100 → 100 | 21 → 67 → 98 → 98 | 21 → 68 → 100 → 100 |
| zwnj-space | 71 | 17 → 17 → 99 → 99 | 99 → 0 → 97 → 97 | 28 → 38 → 96 → 96 | 6 → 44 → 94 → 94 | 4 → 45 → 72 → 73 | 4 → 39 → 73 → 73 |
| zwnj-join | 71 | 100 → 99 → 99 → 99 | 0 → 100 → 100 → 100 | 51 → 99 → 97 → 97 | 6 → 99 → 97 → 97 | 4 → 75 → 70 → 70 | 4 → 92 → 89 → 89 |
| zwnj-add | 64 | 41 → 78 → 84 → 89 | 66 → 59 → 89 → 89 | 28 → 63 → 83 → 83 | 11 → 64 → 84 → 84 | 11 → 41 → 69 → 72 | 11 → 56 → 77 → 77 |
| plural-add | 411 | 91 → 99 → 99 → 99 | 0 → 98 → 99 → 99 | 91 → 100 → 100 → 100 | 13 → 99 → 100 → 100 | 14 → 86 → 87 → 87 | 14 → 97 → 98 → 97 |
| plural-drop | 45 | 91 → 89 → 93 → 93 | 18 → 89 → 98 → 96 | 13 → 82 → 91 → 89 | 4 → 80 → 91 → 89 | 4 → 44 → 58 → 60 | 4 → 78 → 82 → 80 |
| clitic-add | 245 | 85 → 86 → 84 → 87 | 3 → 5 → 5 → 71 | 92 → 90 → 90 → 95 | 14 → 90 → 91 → 96 | 14 → 83 → 83 → 77 | 14 → 90 → 91 → 92 |
| combo | 360 | 25 → 84 → 99 → 99 | 0 → 66 → 99 → 99 | 50 → 93 → 99 → 99 | 11 → 92 → 99 → 99 | 15 → 75 → 85 → 85 | 15 → 90 → 97 → 97 |

Per-lemma macro recall for verb rows (each verb weighted equally, since «شد» and
«می‌شود» dominate), news, test, stock / snowball / fa-light / fa-standard / fa-full:

| row | lemmas | Pagefind | FlexSearch |
|---|---:|---|---|
| verb-tense | 35 | 13 / 21 / 13 / 21 / **92** | 5 / 8 / 2 / 8 / **88** |
| verb-tense-ud | 30 | 3 / 44 / 3 / 44 / **91** | 7 / 28 / 0 / 30 / **90** |
| verb-negation | 29 | 1 / 1 / 1 / 1 / 8 | 5 / 1 / 1 / 1 / 6 |

`verb-tense-ud` is the Hazm-independent check (another form of the same verb from
PerDT's gold lemmas; includes perfect, passive and other forms our conjugator never
makes). It moves like `verb-tense`, so the verb gain is not an artefact of the query
generator and the lexicon both using Hazm. The held-out-lexicon diagnostic is at the
end of this file.

What moved, in one line each (Snowball → fa-standard / fa-full, test):
- **alef-madda**: FlexSearch 5 → 100 (wiki), 0 → 100 (news), 0 → 99 (products): H7.
- **zwnj-join on verbs** (the Phase 0 Snowball regression): news Pagefind 67 → 100, FlexSearch 66 → 100: H2.
- **zwnj-space**: news Pagefind 29 → 99, FlexSearch 8 → 99; wiki FlexSearch 34 → 99 (stock had 100): H5, rejoin.
- **heh-yeh**: FlexSearch 16 / 0 / 0 → 100 on all three corpora: closed-suffix split, ۀ/هٔ folding.
- **clitic-add** (fa-full): wiki Pagefind 21 → 76, FlexSearch 9 → 74; news 46 → 91 and 14 → 87: H1.
- **digits**: 0–97 → 100 on every engine and corpus except Orama (88–100).
- **verb-tense** (fa-full): news Pagefind 28 → 97, FlexSearch 12 → 93: lexicon, H10.
- **std-typing** (products): FlexSearch 70 → 91, Pagefind 83 → 88.
- **diacritics**: too rare in titles to measure (13 dev / < 30 test queries); covered by unit tests.
- **verb-negation** stays low on AND engines (FlexSearch 5 → 8): negation is kept by default (H3).

## The gate (test split)

`node bench/compare.ts <A> <B> --split test`: exact McNemar on found/lost and
Wilcoxon on reciprocal rank per corpus × engine × type, BH-adjusted; a cell blocks
at q < .05 **and** a drop of ≥ 2 points.

| A → B | cells | up | down | blocking |
|---|---:|---:|---:|---:|
| snowball → fa-standard | 402 | 124 | 16 | 14 |
| snowball → fa-full | 402 | 133 | 19 | 13 |
| stock → fa-standard | 402 | 294 | 17 | 10 |
| stock → fa-full | 402 | 300 | 18 | 10 |
| snowball → fa-light | 402 | 125 | 67 | 66 (no stemmer: plurals, verbs) |
| stock → fa-light | 402 | 267 | 13 | 11 |

**Not a clean pass.** What blocks, against Snowball:
1. **Orama, 8 news cells + 1 products in each profile**: MRR drops of 3.8–9.4 points
   (recall −0.4 to −4.5; −11.4 on verb-negation for fa-full). Cause verified in Orama's
   code: its default prefix matching sums the scores of every indexed word a query
   term prefixes, so every extra index term fa-search adds (compound parts, the other
   half-space spelling, the madda-less spelling) adds noise. With prefix matching off
   (`orama-exact`) none of these news cells block. The fix belongs in the Phase 2
   Orama adapter (end every term with a sentinel).
2. **products zwnj-join, MRR only** (MiniSearch, FlexSearch, orama-exact; n = 71): the
   page writes «قهوه‌ای», the searcher «قهوهای», which Snowball reads as a plural
   («قهو»). fa-search indexes both readings (H5b), so the page is found, but every
   brown product now shares the term and the target slips near rank 10. Recall is
   unchanged or −1 to −3.
3. **Pagefind products typo-adjacent (fa-standard) / typo-transpose (fa-full)**,
   −2.5 to −2.7: Snowball's aggressive stripping («آفتایی» → «آفتا») let Pagefind's
   prefix matching rescue a misspelled word by accident; keeping derivational
   suffixes (H8, which cut over-stemming by 40%) removes the accident. Typos are
   Phase 3's (query rescue).
4. wiki orama-exact zwnj-join, MRR −4 with recall unchanged.

Against stock, the blocking cells are mostly MRR drops of 2–4 points on canonical /
plural-drop (Pagefind wiki) and typo rows (MiniSearch news), the ranking cost of
stemming that Snowball pays too, plus products Pagefind zwnj-join (1 query).

## Independent checks

**Conflation against UD gold lemmas** (`node bench/conflation.ts`; Paice indices,
lower is better for both; OI ×10⁶):

| view | snowball UI / OI | fa-standard UI / OI | fa-full UI / OI |
|---|---|---|---|
| Seraji, gold lemmas | 85.3 / 24.4 | **83.0 / 14.7** | 56.8 / 35.1 |
| Seraji, verb families | 85.9 / 22.3 | **83.6 / 12.1** | **55.6 / 21.2** |
| PerDT, gold lemmas | 89.4 / 17.4 | **86.8 / 12.1** | 67.6 / 25.4 |
| PerDT, verb families | 89.9 / 15.3 | **87.2 / 9.4** | **66.7 / 15.1** |

fa-standard improves on raw Snowball on both indices in every view. fa-full cuts
under-stemming by a quarter to a third and stays below Snowball's over-stemming
only in the verb-family view (a verb's infinitive and participle lemmas counted as
the verb, which is what search wants); on raw gold lemmas it is above, because UD
lemmatizes «کردن» and «کرده» apart from «کرد». Reported as is.

**Rejoin rules on UD sentences** (`node bench/rejoin.ts`): 42 false joins across
real spaces in 35,104 sentences; with half-spaces typed as spaces, 98–100% of each
affix's half-spaces restored ([rejoin.md](rejoin.md)).

**Fold collisions** (`node bench/collisions.ts`, forms seen ≥ 50 times), reviewed by
hand: ي ى/ك/ة/ۀ هٔ/أ إ/ؤ, harakat, digits and ZWNJ removal merge spellings of one
word («کتاب»/«كتاب», «تأثیر»/«تاثیر», «دربارهٔ»/«درباره», «آن‌ها»/«آنها»). One
real collision: ئ → ی merges «رئال» (Real, the club) with «ریال» (rial), which
Snowball does too. آ → ا has many (آن/ان, آب/اب, آفت/افت, استان/آستان, and worse
through Snowball: «می‌آیند» → «این»), which is why it is index-only (H7).

**Unit tests** (`npx vitest run`, 136): variant pairs («کتاب‌هایمان», «می‌روم»,
«كيف», «رئیس», «نامه‌ی», «نامه‌ای», «۳۰» and their variants analyze alike), guard
pairs stay apart (آسمان/اسم, ماهی/ماه, مهمان/مهم, هفته/هفت, مردم/مرد, بیست/بود),
offset round trips including one-to-many (ﷺ), idempotence, query ⊆ index terms for
every profile and option, ZWNJ still present when Snowball runs. `npx tsc --noEmit -p .` clean.

## Orama

Every index-side addition in this phase blocked only on Orama. Its default search
looks each query term up as a prefix in its radix tree and adds up the scores of all
matching words (`exact: false`; verified in 3.1.18 `components/index.js`,
`trees/radix.js`). `exact: true` does not help for Persian: it post-filters with a JS
`\b` regex, which never matches between Persian letters. `orama-exact` (a sentinel at
the end of every analyzed term) shows what an adapter gets with prefix matching off:
the news blocks disappear. Phase 2's Orama adapter should do this.

## Decisions (details and arms in [experiments.md](experiments.md))

| claim | result | shipped |
|---|---|---|
| H1 مان/تان/شان need a lexicon | true for a rule alone (blocks); with a mined keep list, joined clitics strip with no regression | full: joined clitics; standard: ZWNJ / ها signals only |
| H2 strip می only after a ZWNJ | false: a rule with 46 exceptions wins, 0 down | standard and full |
| H3 don't strip negation | recall says strip (7 → 99), conflation says keep (OI above Snowball's); precision unmeasured | keep; `negation: "merge"` option |
| H5 ZWNJ → space / keep whole | index both wins (zwnj-space +40–90 on AND engines) | standard and full; light indexes raw segments |
| H5b (new) index the other half-space spelling | fixes products zwnj-join/add | standard and full |
| H7 آ → ا is safe | safe for recall, not for precision (Snowball misreads the folded words) | index-only, all profiles; ئ → ی needed in light |
| H8 (new) strip derivational suffixes | false: keeping them cuts over-stemming 40%, 0 cells change | standard and full |
| H10 (new) one verb lemma for all engines | only for AND engines; any-word engines lose ranking on «شد» | `verbs: "lemma"` (Pagefind, FlexSearch) / `"stem"` (MiniSearch, Orama, Lunr) |
| H4 R1 minimums, H6 4-grams | Phase 1b (need a regenerated stemmer / separate analyzer) | – |

## Held-out lexicon diagnostic

The query generator and the lexicon both use Hazm's verb list, so part of the verb
gain could be circular. `fa-full-heldout` removes from the lexicon every verb whose
lemma appears in a test-split verb query, and is compared with the same lexicon
complete (verb lemmas for every engine, `fa-full-lemma`), test split, news:

| row | Pagefind | FlexSearch | per-lemma macro, Pagefind / FlexSearch |
|---|---|---|---|
| verb-tense | 97 → 28 | 92 → 13 | 92 → 23 / 88 → 10 |
| verb-tense-ud | 81 → 45 | 78 → 29 | 92 → 53 / 91 → 38 |
| zwnj-join | −31 points | | |

With the verb unlisted, full falls back to Snowball's level (verb-tense 28, verb-tense-ud
43–45): the gain is the lexicon's coverage, not a rule that generalizes. Coverage is
the question for real text: the lexicon has 356 of Hazm's 692 pairs (the rest have
fewer than 20 uses of all their forms in 1.4M word types). The zwnj-join drop shows
that full's joined-«می» handling (lexicon only) also depends on it; the rule fallback
(`joinedMi: "rule"` in full) cost nothing on dev and removes that dependency. Not
switched after the test split was read; first thing to revisit.
