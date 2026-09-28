# Phase 1 experiments

Each claim from PLAN.md "Principle" (and one found on the way, H8) run as a
measured experiment. For each: the claim, the arms, the expected trade-off
**written before the run**, then the numbers and the decision.

Judged on the **dev** split only (`bench/lib/split.ts`); the test split is read
once, at the end of the phase (`phase1.md`). The gate is `bench/compare.ts`:
exact McNemar on found/lost and Wilcoxon on reciprocal rank per corpus × engine ×
variant type, Benjamini–Hochberg across the comparison; a cell blocks only at
q < .05 **and** a drop of ≥ 2 points. Independent checks: `bench/conflation.ts`
(UD gold lemmas; UI = under-stemming, OI = over-stemming), `bench/collisions.ts`
(vocabulary pairs a fold merges), `bench/rejoin.ts` (rejoin rules on UD text).

Reading note for all rows: Orama with a whitespace tokenizer has a known ranking
quirk (a common word can outscore a rare one); its cells are annotated, not trusted
alone.

---

## Expected trade-offs (written 2026-09-27, before any arm ran)

**H1: مان/تان/شان can't be told from the ان plural without a lexicon (Snowball).**
Arms (all on top of fa-full unless noted): `h1-none` (no clitic handling beyond
Snowball), base `fa-full` (trust a ZWNJ before the clitic and a preceding ها/های),
`h1-minlen` (standard profile, no list: strip joined مان/تان/شان when ≥ 3 letters
remain, joined ش/م when ≥ 4 remain), `h1-neglist` (fa-full + joined stripping with
the mined keep list protecting real words), `h1-known` (upper bound: strip only when
the remainder is among the 60k most frequent vocabulary forms; not shippable).
Expected: the ZWNJ and ها signals are nearly free (few real words contain
«‌مان» or «هایمان»), so base > none on clitic-add with no cost elsewhere. Joined
stripping should lift clitic-add a lot (plain ش/م are ~80% of it) but over-stem:
`h1-minlen` should hurt canonical/plural rows and raise OI in conflation (فیلم →
فیل, کفش → کف); `h1-neglist` should keep most of the gain at a smaller cost;
`h1-known` bounds what a bigger lexicon could add.

**H2: strip می only after a ZWNJ (Snowball).** Arms: `h2-zwnj` (Snowball's way) vs
`fa-standard` (rule: strip joined می when the rest ends like a verb, except a mined
list of non-verbs); in full, `fa-full` (known verb form only) vs `h2-full-rule`
(known verb form, then the rule). Expected: the rule wins zwnj-join and combo on
news (the Pagefind 100 → 64 regression) with a small over-stemming cost on rare
می-initial names outside the exception list; in full, the rule adds little over the
verb lexicon (most joined می forms are of verbs it knows).

**H3: don't strip نمی/ن, it merges opposites (Snowball).** Arms: `fa-full` (keep
polarity: every negative form of کردن → «نکرد») vs `h3-merge` (fold negation away).
Expected: merge wins verb-negation by a wide margin on AND engines and costs little
on other rows; conflation OI rises (ن-initial words such as «نبرد» merge with
«برد») and UI falls (UD gives negatives the positive lemma). The precision cost
the claim is about (a searcher of «نمی‌خواهم» shown pages about wanting) is invisible
to known-item recall; without graded judgments the decision can only be partial.

**H5: ZWNJ policy (Elasticsearch splits at ZWNJ, Lucene strips it).** Arms:
`fa-standard` (keep the compound whole) vs `h5-split` (split compounds into parts at
index and query time, affixes stay on their host) vs `h5-both` (index both the whole
and the parts; queries use the whole). Expected: split helps zwnj-space on compounds
but hurts ranking (parts are common words: «کتاب»، «خانه»); both should dominate
keep on recall for OR engines and match keep on AND engines, at a small MRR cost.

**H7: folding آ→ا (and ئ→ی without a stemmer) is safe.** Arms: `h7-alef`
(standard + آ→ا) vs `fa-standard`; `h7-light-alef` vs `fa-light`;
`h7-light-nohamza` (light without ئ→ی) vs `fa-light`. Expected: آ→ا fixes
alef-madda (the searcher drops the madda; nothing else does) with collisions such
as آن/ان, آب/اب, آفت/افت, استان/آستان (bench/results/collisions.md) costing a
little on canonical rows; ئ→ی is needed for the hamza row in light and costs
nothing visible (Snowball does it anyway in standard).

**H8 (new, found in conflation): Snowball's derivational suffixes should be
stripped.** Snowball cuts گاه، گی، مند، انه، یت… («دستگاه» → «دست», «زندگی» → «زند»,
«ماهیت» → «ماه»). Arms: `h8-keep` (put a derivational suffix Snowball cut back,
so only inflection comes off) vs `fa-standard`; `h8-full-keep` vs `fa-full`.
Expected: conflation OI falls by about a third at a small UI cost (measured before
the run: Seraji OI 24.4 → 14.7, PerDT 17.4 → 12.1); recall rows barely move,
since no variant type adds or drops a derivational suffix, and MRR may improve a
little from fewer spurious matches.


### Added during the phase (expectations written 2026-09-27, before these arms ran)

**H7, two more arms**, after `bench/collisions.ts --diff fa-standard,h7-alef` showed
that folding آ→ا *before* Snowball breaks its rules («می‌آید» → «می», «می‌آیند» →
«این», «آستین» → «است», «آسمانی» → «اسم»): `h7-alef-post` folds the finished term
(collisions nearly identical, measured: Snowball's own stripping still merges them),
and `h7-alef-index` adds the madda-less spelling's term at index time only.
Expected: `h7-alef-index` gets most of alef-madda's gain with no loss on canonical
rows (a query typed with the madda matches exactly as before); the cost is a little
noise for queries typed without it.

**H5b: index the other half-space spelling** (`h5-spellings`, `h5-full-spellings`),
after fa-standard blocked on products zwnj-join. The page's «قهوه‌ای» is split to
«قهوه», but the searcher's «قهوهای» goes to Snowball, which cuts «های» → «قهو»; the
page's «سگهای» hits Snowball's R1 minimum → «سگه» while «سگ‌های» → «سگ». The arm
indexes, for a ZWNJ word, the term its joined spelling gets, and for a joined word
ending in ها/های/هایی, the term of the half-space spelling. Queries unchanged.
Expected: zwnj-join and zwnj-add on products recover to at least Snowball's level;
a small MRR cost on OR engines from extra index terms («تنها» also indexes «تن»).

**H10: verbs as one lemma** (`h10-both` vs `fa-full`), after fa-full blocked on
17 news cells (typos, homophones, zwnj rows on Orama, MiniSearch, Lunr): every lost
query ends in a light verb («می‌شود», «شدند»), whose lemma «شد» is in nearly every
news document, so when another query word is misspelled the verb no longer helps
rank the target. Arm: index both the lemma and the tense-keeping stem; AND engines
(Pagefind, FlexSearch) query the lemma only (one term per token), any-word engines
(MiniSearch, Orama, Lunr) also send the stem (new query mode `any`). Expected: the
blocked OR-engine cells return to fa-standard's level, the verb-row gains on AND
engines stay, and OR-engine verb rows (already ~100) stay.

---

## Results

Each decision below: claim, arms, numbers (dev split), decision. Test-split numbers for the final profiles: phase1.md.

### H8: strip derivational suffixes? **No: keep them.** (adopted in every profile)

| | conflation UI % (Seraji / PerDT) | OI ×10⁶ (Seraji / PerDT) | benchmark (dev, vs fa-standard) |
|---|---:|---:|---|
| snowball | 85.3 / 89.4 | 24.4 / 17.4 | |
| fa-standard (strip, Snowball's way) | 82.4 / 86.3 | 25.0 / 18.9 | |
| h8-keep | 83.0 / 86.8 | **14.7 / 12.1** | 335 cells: 0 up, 0 down, 0 blocking |

Putting back a derivational suffix Snowball cut (گاه، مند، وار، گار، بان، انه، ناک،
انی، یت، گی، یی) removes about 40% of the wrong merges (دستگاه/دست, زندگی/زند,
ماهیت/ماه, کارمند/کار) at +0.5 points of under-stemming, and changes no benchmark
cell: no variant type adds or drops a derivational suffix, so known-item recall
cannot see the merges either way. The decision rests on conflation, as predicted.
Upstream candidate (Snowball): make the derivational endings optional, or R2-gated.

### H10: verbs as one lemma for every engine? **Only for engines that require every word.** (adopted: fa-full)

`fa-full` with verb lemmas everywhere (now `fa-full-lemma`) lifts the verb rows on the
engines that require every query word (news, dev: Pagefind verb-tense 29 → 95,
FlexSearch 15 → 91; the Hazm-independent verb-tense-ud 36 → 85, 25 → 83), but blocks
on 15 news cells against fa-standard, all on the engines that match any word
(Orama, MiniSearch, Lunr): homophone and typo rows drop 2–6 points. Every lost
query ends in a light verb («می‌شود», «شدند»): its lemma «شد» is in nearly every news
document, so when another query word is misspelled the verb stops ranking the target.

| arm (vs fa-standard, dev) | up | down | blocking | what blocks |
|---|---:|---:|---:|---|
| fa-full-lemma: lemma everywhere | 9 | 15 | 15 | news typo/homophone rows on Orama, MiniSearch, Lunr |
| h10-both: index lemma + stem; any-word engines query both | 7 | 15 | 13 | Orama everywhere on news; verb-negation on MiniSearch/Lunr (a negated query's extra stem never matches, and MiniSearch scores unmatched words down) |
| h10-surface: index both; any-word engines query the stem only | 6 | 15 | 11 | Orama only (the extra index terms change its statistics) |
| **h10-engine: lemma for Pagefind/FlexSearch, stem for MiniSearch/Orama/Lunr, at index and query time** | **5** | **0** | **0** | – |

Any-word engines already find the page through the query's other words (their verb
rows are 92–100 with or without lemmas), so for them the lemma only costs ranking.
Decision: the analyzer takes `verbs: "lemma" | "stem"`; the Phase 2 adapters choose it
from the engine's matching semantics, and the bench config `fa-full` does the same.
The code of the two losing arms was removed; this table is their record.

### H5b: index the other half-space spelling? **Yes.** (adopted in standard and full)

fa-standard blocked against Snowball on products zwnj-join (Orama, MiniSearch,
FlexSearch, Lunr) and zwnj-add (Pagefind): the page's «قهوه‌ای» is split to «قهوه»
while the searcher's «قهوهای» goes to Snowball («قهو»); the page's «سگهای» hits
Snowball's 3-letter R1 minimum («سگه») while «سگ‌های» → «سگ». Snowball alone matched
these by treating both spellings the same (badly). `h5-spellings` indexes the term of
the other spelling too; queries are unchanged.

| dev, products | FlexSearch zwnj-join | MiniSearch zwnj-join | Lunr zwnj-join | coverage zwnj-join / zwnj-add / plural-drop |
|---|---:|---:|---:|---:|
| snowball | 95 | 95 | 94 | 97 / 77 / 79 |
| fa-standard | 70 | 89 | 86 | 72 / 82 / 79 |
| h5-spellings | 95 | 97 | 95 | 100 / 100 / 100 |

Against fa-standard: 3 cells up, 4 down, **1 blocking: Orama news typo-adjacent
(recall −1.2, MRR −2.3)**; against Snowball: 73 up, 12 down, 2 blocking (Orama news
typo-adjacent and plural-add). Both are Orama, the engine whose ranking reacts to any
extra index term in this phase (H10's arms too). Likely cause, **not verified**:
Orama's default prefix matching, which lets a short extra term such as «تن» (indexed
for «تنها») match as a prefix of many words (RESEARCH.md §4). Adopted because it
removes 4 of the 5 cells that block fa-standard against Snowball; the Orama cell is
left open for the Phase 2 Orama adapter, which has to look at prefix matching anyway.

### H3: don't strip نمی/ن, it merges opposites? **Recall says strip; the over-stemming gate says keep.** (default: keep; `negation: "merge"` is an option)

`h3-merge` vs its base `fa-full-lemma` (dev): 5 cells up, 9 down, **0 blocking**.
verb-negation (news): Pagefind 11 → 99, FlexSearch 7 → 99; per-lemma macro 4 → 100
and 1 → 100. The drops are ≤ 2 points on any-word engines' typo rows (news).

Conflation: in the candidate final profile, merging negation raises over-stemming
above raw Snowball's (PerDT, verb families: OI 15.1 → 20.9, Snowball 15.3; Seraji
21.2 → 30.9, Snowball 22.3), while keeping it stays below. Read by hand, part of the
added merges are PerDT giving negated infinitives and participles their own lemmas
(«نکردن», «نکرده») (which is the very question here, so the metric is not adjusted
for it), and part are ن-initial words that are not negated verbs: «نزد» (at) →
«زد», «نبرد» (battle) → «برد», «نیا» (grandfather) → «آمد». The lexicon build now
keeps the latter (a negated form is much rarer than its positive: 13 words such as
نزد، نخست، نیازی، نجوم).

The claim's own concern, a searcher of «نمی‌خواهم» shown pages about wanting, is a
precision cost known-item search cannot see; the recall gain it can see is large.
Decision: default **keep** (the plan's gate: over-stemming must stay below Snowball's;
and the precision side is unmeasured), `negation: "merge"` offered as an option with
these numbers. To settle it: graded judgments (Phase 0 leftover). Not proposed upstream.

### H2: strip می only after a ZWNJ? **No: a rule with an exception list wins.** (standard and full)

`fa-standard` (joined «می» stripped when the rest ends like a verb, except 46 mined
non-verb entries such as میلادی، میزبانی، میکرو*) vs `h2-zwnj` (Snowball's way), dev:
4 cells up, 0 down, 0 blocking. news zwnj-join: Pagefind 61 → 99, FlexSearch 57 → 97
(the Phase 0 regression «میکند» ≠ «می‌کند»); news combo: Pagefind 84 → 93,
FlexSearch 70 → 79. `bench/collisions.ts --diff h2-zwnj,fa-standard` (63 groups,
forms seen ≥ 50 times): the merges are «میشود»/«می‌شود»-type spellings of one word,
except «میلی» → «لی», a bug (a prefix exception did not cover the word itself), fixed.
Upstream candidate (Snowball): strip joined می when what follows ends in a person
ending, with a short exception list (the list is corpus-mined; would need an
OSI-licensed source for snowball-data).

### H1: مان/تان/شان can't be told from the ان plural without a lexicon? **With a keep list, strip them.** (full: joined stripping; standard: ZWNJ and ها signals only)

| arm (dev) | vs | up | down | blocking | clitic-add, FlexSearch (wiki / news / products) |
|---|---|---:|---:|---:|---|
| h1-none: Snowball only | fa-full-lemma (ZWNJ + ها signals) | 0 | 0 | 0 | 15 / 17 / 3 → 17 / 22 / 3 (base) |
| h1-neglist: + joined مان/تان/شان (≥ 3 letters left) and ش/م (≥ 3 left), mined keep list | fa-full-lemma | 13 | 0 | 0 | 17 / 22 / 3 → **71 / 88 / 73** |
| h1-minlen: same rules, no list (standard) | fa-standard | 13 | 1 | **1** (news FlexSearch zwnj-join −6) | 15 / 21 / 3 → 58 / 82 / 53 |

The two free signals (a ZWNJ before the clitic, a preceding ها) are safe and add a
little. Stripping the joined clitics is where the gain is (plain ش/م are most of
clitic-add), and it needs the keep list: without it, words like «فیلم» → «فیل»,
«کفش» → «کف» cost a blocking cell; with it, nothing regresses. Conflation cost of the
joined stripping in the final full profile (PerDT, verb families): OI 12.9 → 15.1,
still below Snowball's 15.3. The keep list is mined, not a known-word list: 1,040
words (a word that takes a plural itself is a word, not word + clitic), 9 KB gzipped
with the verbs. `h1-known` (strip only when the remainder is among the 60k most
frequent forms, an upper bound nothing shippable could reach) is reported below when
its run finishes. The Snowball maintainers' reason holds for a rule-only stemmer;
with a small lexicon the distinction can be made. Not proposed upstream (it needs
the list).

### H7: folding آ→ا is safe? **Safe for recall; confine it to the index.** (standard and full: `alefMadda: "index"`)

| arm vs fa-standard (dev) | up | down | blocking | alef-madda, FlexSearch (wiki / news / products) | alef-madda, Orama |
|---|---:|---:|---:|---|---|
| h7-alef: fold before stemming | 21 | 0 | 0 | 5 / 1 / 0 → 100 / 99 / 99 | 22 / 79 / 43 → 92 / 97 / 83 |
| h7-alef-index: index the madda-less spelling's term too | 20 | 1 (Orama news canonical, −1) | 0 | 5 / 1 / 0 → 100 / 99 / 99 | 22 / 79 / 43 → 87 / 94 / 80 |
| h7-alef-post: fold the finished term | (below, when its run finishes) | | | | |

The claim holds for recall: nothing the benchmark measures gets worse. It does not
hold for what the benchmark cannot see. `bench/collisions.ts --diff fa-standard,h7-alef`
(335 groups, forms seen ≥ 50 times): folding before Snowball breaks its rules on
correctly typed words, «می‌آید» → «می», «می‌آیند» → «این», «آستین» → «است»,
«آسمانی» → «اسم», «آلمانی»/«الماس» → «الم»; the plan's protected-ان handling
(«آسمان») covers only a sliver of this. Folding the finished term (`post`) gives the
same collisions (Snowball's own stripping, measured before its run). The index-only arm
leaves every query typed with the madda exactly as before and confines the merges
to queries typed without it, for one cell of Orama noise. Decision: `alefMadda:
"index"`. Conflation is unaffected (it analyzes forms in query mode).

### H5: ZWNJ becomes a space (Elasticsearch) / keep the word whole? **Index both.** (standard and full: `zwnj: "both"`)

`h5-both` (index a ZWNJ compound whole *and* its parts; queries keep the whole) vs
`fa-standard` (whole only), dev: 29 cells up, 17 down, 16 blocking, **every blocking
cell Orama** (15 news, 1 products). zwnj-space: FlexSearch 49 → 100 (wiki), 74 → 100
(news), 44 → 90 (products); Pagefind 57 → 97, 81 → 100, 52 → 97; MiniSearch 58 → 100.
It also closes the gap to stock FlexSearch (which splits at the half-space: 100 on
wiki zwnj-space, where fa-standard had 49).

**Orama's losses are its prefix matching, verified in its code** (3.1.18
`components/index.js`, `trees/radix.js`): with `exact: false` (default) every query
term is looked up as a prefix and the scores of all indexed words it prefixes are
summed, so any extra short index term (a compound's part, H5b's other spelling, H7's
madda-less spelling) adds score to unrelated documents. `exact: true` cannot fix it for
Persian: it post-filters with a JS `\b` regex, which never matches between Persian
letters (why "exact returned no hits" in Phase 0). This is the Orama ranking quirk
first seen in Phase 0. The bench now has an `orama-exact` engine (a sentinel ends
every analyzed term, so a term only prefixes itself) to check the final profiles
with prefix matching off; see phase1.md.

`h5-split` (compounds split into parts at both ends, Elasticsearch's way) is reported
below when its run finishes.

#### H7 in the light profile (no stemmer)

| arm vs light as it was (dev) | up | down | blocking | notes |
|---|---:|---:|---:|---|
| h7-light-nohamza: no ئ → ی | 0 | 15 | **15** | every hamza cell: news FlexSearch 86 → 10, Pagefind 86 → 14 |
| h7-light-alef: آ → ا folded | 23 | 3 | 1 (Orama products layout-latin-on-fa, −3.6) | alef-madda FlexSearch 6 / 1 / 0 → 100 / 99 / 99 |

ئ → ی is not just safe but needed once there is no stemmer to do it (Snowball folds it
itself). For آ, light takes the same index-only form as the other profiles, for H7's
collision reason; the old light runs are kept as `h7-light-none` so the final fa-light
is measured against light without it (phase1.md).

### Last arms (compared against sibling arms on the same, pre-decision base)

- **h7-alef-post vs h7-alef** (fold the finished term vs fold before stemming): 335
  cells, 0 up, 0 down. Same outcome, same collisions: the post fold is not a way
  around Snowball's misreadings.
- **h5-split vs h5-both** (compounds as separate words at both ends, Elasticsearch's
  way, vs index both): 30 up, 34 down, **33 blocking**. zwnj-join collapses (FlexSearch
  wiki −72, MiniSearch −63): a searcher's «کتابخانه» no longer matches the page's
  «کتاب‌خانه» once the page only has «کتاب» + «خانه». Index both wins H5 clearly.
- **h1-known vs h1-neglist** (strip a joined clitic only when the remainder is among
  the 60k most frequent vocabulary forms, an upper bound, vs the mined keep list):
  1 up, 0 down. A large known-word list would add almost nothing over the 1,040-word
  keep list.
- **h2-full-rule vs fa-full-lemma** (full profile: joined «می» by lexicon, then the
  rule as fallback, vs lexicon only): 0 up, 0 down on dev: the lexicon already knows
  the benchmark's verbs. But see the held-out diagnostic in phase1.md: with a verb
  missing from the lexicon, lexicon-only loses zwnj-join (news Pagefind −31), so the
  rule fallback is free insurance. Switched afterwards and re-measured against the
  previous full (`fa-full-v1`): dev and test both 1 up, 0 down, 0 blocking.

---

# Phase 2 experiments: the shipped adapters

Same method as Phase 1 (dev split, `bench/compare.ts`). Each arm is the shipped
adapter with one option changed, run only on its engine. Baselines: `p1-standard` /
`p1-full` (Phase 1's bench wiring: pre-analyzed text, engine processing off; runs
copied from Phase 1's fa-* runs) and the adapter configs `fa-standard` / `fa-full`.

## Expected trade-offs (written 2026-09-27, before any arm ran)

Found while building the Pagefind adapter, before any run: Pagefind shows hidden
text in excerpts like visible text (a probe of 3 pages: the query «کتاب» on a page
spelled with Arabic ك got an excerpt made of the hidden block's stems), and
`data-pagefind-index-attrs` text shows in excerpts too (at its element's
position), so neither hides the terms. The adapter therefore wraps the block in
⁅ ⁆ (kept in Pagefind's `content`, never searchable, checked for 6 candidate
characters) and ships `processResult`, which rebuilds the excerpt from the page's
visible text. P1's excerpt check measures both Pagefind's own excerpt and the
rebuilt one.

**P1: Pagefind page layout.** Arms, all standard profile: (a) `fa-standard`: the
page's own text + a hidden block of all index terms (a heading's terms keep its
weight); (b) `p1-standard`: analyzed text only (Phase 1's wiring); (c)
`pf-weight2`: as (a), body block at `data-pagefind-weight` 2; (d) `pf-new`: as
(a), but the block holds only terms that are not already a word of the page as
Pagefind indexes it (lowercased, NFD marks stripped, ZWNJ parts and joined form).
Expected: (a) ≈ (b) on recall, since every query term is in the block in both;
ranking may move either way, because the page's own words also match by prefix and
add score (more for long wiki pages). (c) should favour the block over the page's
words, so closer to (b) in rank, with more excerpts on the block. (d) should leave
Pagefind's own matching to do more of the work: fewer excerpts on the block, but
recall losses where my model of Pagefind's word splitting is wrong. Excerpts: in
(a), a large share of top-10 excerpts (> 30%) land on the block for pages written
with Arabic letters or no half-space, where only the block matches exactly; after
`processResult` none do, and nearly all rebuilt excerpts show a marked word.

**P2: FlexSearch drop-in encoder vs `faDocument`.** Arms: `flex-dropin`,
`flex-dropin-full` (one `encode` for both sides, so query mode on both) vs
`fa-standard` / `fa-full` (`faDocument`: index mode while adding). Expected: the
drop-in loses every row that needs index mode's extra terms: zwnj-space (a
compound's parts), alef-madda (the madda-less spelling), and part of zwnj-join /
zwnj-add (the other half-space spelling); canonical and the rest unchanged.

**P3: Orama with and without the sentinel.** Arms: `orama-nosentinel`,
`orama-nosentinel-full` vs `fa-standard` / `fa-full`. Expected: without the
sentinel, Orama's prefix lookup sums scores over every indexed word a query term
prefixes, so the extra index terms push unrelated pages up: the news ranking
blocks of Phase 1 (Orama news canonical, zwnj-space and others) come back; with it,
Orama behaves like Phase 1's `orama-exact`.

**P4: MiniSearch with `combineWith: "AND"`, verbs lemma vs stem.** Arms
(full profile, MiniSearch only): `ms-and-lemma` (the adapter's default under AND)
vs `ms-and-stem`. Expected: as H10 found for AND engines (Pagefind, FlexSearch),
lemmas win verb-tense and verb-tense-ud by a wide margin on news and cost little
elsewhere; so the adapter's switch to lemma under AND is right.

**P3b (added 2026-09-27 after the first products run of fa-light, before this arm ran):
Orama's sentinel in the light profile.** fa-light through the adapter lost Orama
products plural-drop (−40 vs `p1-light`). Light has no stemmer, so Orama's prefix
lookup was its only way from «قیمت» to a page's joined «قیمتها»; the sentinel
removes it. Arm: `orama-nosentinel-light` vs `fa-light`. Expected: without the
sentinel light gets plural-drop back (and some clitic-add), at the cost of
Orama's prefix-score noise on canonical ranking; if it wins, `exactTerms` should
default to off for the light profile only.

**P1b (added 2026-09-27 after the first products runs, before these arms ran): the
page title.** fa-standard through the adapter lost products Pagefind std-typing
(−12 vs `p1-standard`, pages spelled with Arabic ي/ك). Probed on 1.5.2 (5-page
indexes): Pagefind ranks a match in the page's **title meta** (its first `<h1>`)
far above one in the text: overriding the title of a page that matches drops its
score from 0.64 to 0.26, the same as a page whose Arabic-spelled title does not
match; the hidden block's `data-pagefind-weight` works (0.20 vs 0.10 without) but
cannot reach the title's share. Phase 1's wiring never saw this: its titles were
analyzed text. Two more findings: Pagefind indexes a half-space word joined
(«تی‌شرت» → «تیشرت»; «شرت» alone finds nothing), not as parts, so `pf-new`'s first
run (which assumed parts) lost zwnj-space and is re-run with the corrected model;
and a meta value can come from an attribute (`data-pagefind-meta="title[data-x]"`),
which keeps commas safe and adds nothing to the indexed text. Arms (standard, as
`fa-standard` plus one option): `pf-title-fold` (title meta = the normalized title),
`pf-title-terms` (title meta = the title's index terms); both keep the real title as
meta `fa_title`, which `processResult` shows. Expected: both recover std-typing and
arabic-yk ranking on products (titles are most of a product page); `terms` also
matches stems and spelling variants in the title (plural, clitic, zwnj-space), so it
should rank closest to `p1-standard`; `fold` changes less. Risk: titles made of
terms may over-reward pages whose title shares a common stem.

**P1c (added 2026-09-27 after `pf-title-fold`'s products run, before this arm ran).**
`pf-title-fold` alone left std-typing where it was: in the lost query «کاغذ» the
Arabic-spelled target rose from 12.5 to 30.4 but the Persian-spelled pages sit at
34.6, because with "all" terms they match twice at heading weight (their visible
word and the block) and the target once. Arm `pf-new-fold` (`terms: "new"` +
`title: "fold"`): every page then has each term once from its text or its block,
and the title matches either way. Expected: std-typing and arabic-yk back to
`p1-standard`'s level, zwnj-space kept (the corrected word model), fewer excerpts on
the block.

**P1d (added 2026-09-27 after the title arms' products and news runs, before this arm
ran).** Neither title arm moved products std-typing. The 13 lost queries are real
misses, not ties: e.g. «کتاب حسینیان» → target 68.7 vs top 286. Pagefind prefix-matches
each query term against every indexed word, so the stem «حسین» also matches the
visible «حسینیان» on pages typed in Persian, while a page typed with Arabic ي
(«حسينيان») gets only the block's exact term. Phase 1's wiring had no visible text,
so every page was equal. (Also found: Pagefind counts the ⁅ ⁆ markers as words, +2
to page length.) Arm `pf-surface` (`terms: "new"`, `title: "terms"`, plus
`surface`: the normalized spelling of each visible word Pagefind reads differently).
Expected: products std-typing back near `p1-standard`; wiki/news unchanged or
slightly up on arabic-yk and std-typing; the block grows only on pages with Arabic
letters or diacritics.

**P1e (added 2026-09-27 after `pf-surface`'s runs, before this arm ran).** `pf-surface`
has no blocking cell against `p1-standard` on wiki and news; products std-typing still
blocks (−10.5, 11 lost). Probed (5-page and 36-page indexes): a page's Pagefind score
falls with every extra word (13 words 14.15 → 17 words 13.78, same match), the
position of the match does not matter, and a marker glued to a term costs nothing
(adopted: `⁅terms⁆`). Arm `pf-prefix` (as `pf-surface`, `terms: "prefix"`): also drop
a term that begins a longer word of the page or of the block («حسین» when «حسینیان» is
there), since Pagefind reaches it by prefix anyway. Expected: shorter blocks, so
std-typing on products closer to `p1-standard`; a small MRR cost where an exact match
used to outrank a prefix match.

## Phase 2 results (dev split)

### P2: FlexSearch drop-in encoder vs `faDocument`? **`faDocument`; the drop-in stays, documented as the lesser option.**

| arm vs base (dev) | up | down | blocking | alef-madda (wiki / news / products) | zwnj-space | combo |
|---|---:|---:|---:|---|---|---|
| flex-dropin vs fa-standard | 0 | 12 | 12 | 100 / 99 / 99 → 6 / 1 / 0 | 100 / 100 / 91 → 48 / 75 / 44 | 97 / 99 / 97 → 76 / 79 / 89 |
| flex-dropin-full vs fa-full | 0 | 14 | 14 | same as above | same | also zwnj-join 100 / 100 / 95 → 91 / 95 / 68 |

As expected: FlexSearch calls one `encode` for both sides, so the drop-in encoder can
only run query mode and loses every row that needs index mode's extra terms (the
madda-less spelling, a compound's parts, the other half-space spelling; products
also zwnj-join 95 → 70, zwnj-add 90 → 72, plural-drop 100 → 79). `faDocument` switches the encoder to index mode
around `add`/`append`/`update`, which is what the benchmark's fa-* configs use.

### P3: Orama with the sentinel? **Yes, in every profile.** (`exactTerms` default true)

| arm vs base (dev) | up | down | blocking | canonical (wiki / news / products) | typo-delete |
|---|---:|---:|---:|---|---|
| orama-nosentinel vs fa-standard | 1 | 55 | 55 | 100 / 100 / 96 → 96 / 97 / 86 | 29 / 97 / 57 → 38 / 84 / 60 |
| orama-nosentinel-full vs fa-full | 1 | 55 | 55 | same pattern | same pattern |

Without the sentinel Orama's prefix lookup sums scores over every indexed word a query
term prefixes, and every row loses rank (digits wiki −13, clitic-add −8 to −10). The one
cell it wins is wiki typo-delete (29 → 38): a query missing its last letters is a
prefix of the right word. That is typo tolerance by accident; typos are Phase 3
(query rescue), and Orama's own `tolerance` is the direct tool.

**P3b (light profile):** `orama-nosentinel-light` vs `fa-light`: 3 up, 55 down, 55
blocking. It wins what was expected (plural-drop: wiki 80 → 95, products 25 → 64;
light has no stemmer, so prefix matching was its only way from singular to plural)
and loses everywhere else as in P3. It is identical to `p1-light` (0 cells differ),
Phase 1's wiring having no sentinel. Decision: the sentinel stays on for light too;
light's Orama plural-drop cells vs `p1-light` are this decision's cost, and
standard/full (with a stemmer) do not pay it.

### P4: MiniSearch with `combineWith: "AND"`: lemma or stem? **Lemma** (the adapter's default under AND)

`ms-and-lemma` vs `ms-and-stem` (full profile, MiniSearch only): 3 up, 0 down, 0
blocking. News verb-tense 24 → 95, verb-tense-ud 29 → 82, verb-negation 3 → 10
(per-lemma macro: 23 → 92, 29 → 81); every other row unchanged. Same as H10 found for
Pagefind and FlexSearch: when every query word must match, another tense only
matches through a shared lemma.

**P1f (added 2026-09-27 after all P1 arms had run once, before these re-runs).** On dev
vs `p1-standard`, both `pf-surface` and `pf-title-terms` have no blocking cell on
wiki and news; head to head, `pf-title-terms` → `pf-surface` is 0 up, 2 down (news
homophone −4.8, typo-adjacent −3.0: with fewer block terms, a query whose misspelled
word Pagefind drops ranks the target lower). But the P1 arms before `pf-surface` ran
with spaced markers (+2 words per block). Re-run with glued markers: `pf-title-terms`
(`terms: "all"`, `title: "terms"`), and the untested combination `pf-all-surface`
(`terms: "all"`, `title: "terms"`, `surface`). Expected: `pf-all-surface` ≥
`pf-title-terms` on products std-typing (the normalized visible words restore prefix
parity) and equal elsewhere; the final default is whichever has no significant loss
against the others.

### P1: Pagefind page layout. **The page's own text + a hidden block of all index terms, the title's terms as Pagefind's title meta, and the normalized spelling of words Pagefind reads differently** (`faPagefindIndex` defaults: `terms: "all"`, `title: "terms"`, `surface: true`; arm `pf-all-surface`)

Each arm vs `p1-standard` (Phase 1's wiring, (b): analyzed text only), Pagefind cells,
dev split: significant up / down / blocking, and the blocking cells (recall / MRR
points).

| arm | terms | title | surface | wiki | news | products |
|---|---|---|---|---|---|---|
| (a) first adapter layout (`fa-standard` as first run) | all | page's own | – | 5 blocking: digits MRR −13, hamza −9, heh-yeh −5, zwnj-space −5, plural-add −3 | 4 blocking (MRR −2 to −5) | std-typing −12 / −13 |
| (c) `pf-weight2` | all, body block weight 2 | own | – | 0 / 8 / 7 (digits MRR −17, hamza −15) | 4 / 7 / 5 | std-typing −12 |
| `pf-new` | new | own | – | 1 / 6 / 5 (digits MRR −11, hamza −8) | 0 / 0 / 0 | std-typing −12 / −15 |
| `pf-title-fold` | all | normalized | – | 1 / 3 / 3 | 4 / 8 / 6 | std-typing −12 |
| `pf-new-fold` | new | normalized | – | 1 / 3 / 2 | 0 / 6 / 4 | std-typing −12 |
| `pf-title-terms` | all | terms | – | 1 / 0 / 0 | 4 / 0 / 0 | std-typing −12 / −12 |
| `pf-surface` | new | terms | yes | 1 / 2 / 0 | 0 / 0 / 0 | std-typing −10.5 / −11 |
| `pf-prefix` (products only) | prefix | terms | yes | – | – | std-typing −12 / −12 |
| **`pf-all-surface`** | **all** | **terms** | **yes** | **1 / 0 / 0** | **4 / 0 / 0** | **std-typing −10.5 / −11** |

Head to head: `pf-all-surface` vs `pf-surface` 2 up (news homophone +4.8, typo-adjacent
+3.4), 0 down; vs `pf-title-terms` 0 / 0 (products std-typing −12.4 → −10.5 is not
significant on its own). The (a)/(c) and fold arms ran with spaced markers, the rest with
glued ones.

What the arms taught (each probed on small Pagefind 1.5.2 indexes first, see P1b–P1e):
- Pagefind ranks a match in the **title meta** far above one in the text. Giving it
  the title's analyzed terms (`title: "terms"`, real title kept in meta `fa_title`) is
  what removed the wiki and news ranking losses; a folded title did much less.
- Every extra indexed word lowers a page's score a little (page length); a ⁅ ⁆ marker
  on its own counts as a word, a glued one does not. The position of the match does not
  matter, nor does hiding the element.
- Pagefind matches query terms as prefixes of the page's words, so a page already
  typed in standard Persian gets extra prefix hits from its visible text that a page
  typed with Arabic ي/ك cannot get. `surface` adds the normalized spelling of such words
  and recovers part of it; dropping block terms the page already has (`new`) or reaches
  by prefix (`prefix`) saves length but costs rank elsewhere.
- **Remaining: products std-typing, −10.5 recall vs Phase 1's wiring** (11 of 105 dev
  queries). Phase 1's wiring replaced every page's text with analyzed terms, so pages
  typed with and without Arabic letters were identical to Pagefind; a shippable adapter
  has to keep the page's text (results show it, excerpts and titles come from it), and
  on short product pages the remaining asymmetry (page length, prefix hits on visible
  Persian words) decides near-ties between near-duplicate products. Against stock
  Pagefind the same row goes 16 → 77 (dev). Accepted, and left as a Phase 4 item: a
  Persian mode inside Pagefind itself (the upstream PR) removes the asymmetry.

Excerpts (`bench/results/excerpts.md`, 300 dev queries per corpus, every top-10
result, final layout): Pagefind's own excerpt shows the hidden block for 42% of wiki
results, 46–65% on news and 100% on products (a product page is shorter than the
30-word excerpt window), about the same as the first layout: the hidden text is
indexed text to Pagefind whatever its layout. After `processResult` no excerpt shows
it, and on every row the analyzer handles, 99.4% (wiki) and 100% (news, products) of
rebuilt excerpts mark a word of the page. On typo and keyboard-layout rows the
rebuilt excerpt marks a word less often than Pagefind's own (wiki 42% vs 64%), since
Pagefind backs misspelled words off to shorter prefixes and the rebuild does not
follow it: a Phase 3 item.

---

# Phase 3 experiments: query rescue

Same protocol: expectations written before the arms run, dev split only, gate
`bench/compare.ts`; test split read once at the end (`phase3.md`). The base is
`fa-full` (Phase 2's shipped adapters); `fa-rescue` adds `fa-search-kit/rescue` as a
site would set it up (in-browser engines: `rescue.addText` next to indexing, the term
set decides "known"; Pagefind: word list built while annotating, a probe search
decides "known"). New guards, in the extra query set `bench/data/queries/<corpus>.rescue.jsonl`
(`bench/rescue-queries.ts`): **false fixes** (one-word queries that are fine as typed but
not on the site: ff-real, ff-short, ff-latin, ff-digits, ff-name, ff-inflected; a rewrite
is a false fix) and **typo-uniform** (dev only: one letter, the first included, replaced
by a uniformly random letter, so the speller's own cost tables do not also write the
test). Plus the **notice rate** on rows that are spelled correctly.

## Expected trade-offs (written 2026-09-27, before any run)

**fa-rescue vs fa-full.** Wrong-keyboard rows (layout-isiri9147, -win-legacy,
-mac-legacy) rise from 0–13 to near each engine's canonical level (roughly 80–95), since
each layout gives its own candidate and the index says which is a word; the rest are
queries whose Latin/digit tokens or ZWNJ-as-space survive the round trip badly.
layout-latin-on-fa (products) rises the same way. Typo rows: the big gains are on the
engines that need every word, Pagefind and FlexSearch (wiki typo rows 1–30 → 50–80);
OR engines already find most typo'd queries through the other words, so recall moves
less there but MRR should rise. What the speller cannot fix: a typo-delete that leaves a
3-letter word (only sound-alike swaps are allowed at 3 letters), a first letter changed
across sound-alike classes, and a typo that lands on another site word (it is then
"known"). The bigger the site, the more often distance 1 reaches a wrong but more common
word: wiki (20k long articles) is the hard case. Correctly spelled rows: notice rate ≈ 0
(every canonical word is on its target page, so known), recall unchanged. False fixes:
**not ≈ 0 for real words that are absent from the site**: an unknown real word within
distance 1 of a site word gets rewritten; ff-real and ff-name 20–50% on wiki and news,
less on products; ff-short lower (3 letters: sound-alike only; 2 letters never); ff-latin
low (a conversion must itself be known; 3–4-letter Latin strings are the risk); ff-digits
≈ 0; ff-inflected mostly carried by the analyzer, the rest (10–30%) rewritten, usually to
the base word. Bytes per weak Pagefind query: tens of KB on wiki (20k pages), a few KB on
products.

**R1: trigger.** `r1-empty` (fix only when nothing is found) vs `fa-rescue` (also when a
query word is unknown to the index). Expected: identical on FlexSearch (a missing word
means no results there); on Pagefind, which drops unknown words silently, `empty` loses
most typo fixes of multi-word queries (typo rows 20–40 points lower); on OR engines it
loses typo fixes whenever another word finds something, so typo recall and MRR lower. It
should also have fewer false fixes only on multi-word queries (the guard set is one-word,
so the same there).

**R3: costs.** `r3-plain` (every edit costs 1, ties by count) vs Persian-aware costs.
Expected: Persian-aware wins homophone (+5–15) and typo-adjacent (+3–8), about equal on
typo-delete and typo-transpose; on typo-uniform the gap shrinks to ≈ 0 or reverses (the
circularity the guard exists for). Plain also skips 3-letter words (it cannot tell a
sound-alike swap), so a small loss there.

**R4: engine-native typo tolerance** (MiniSearch `fuzzy: 0.2`, Orama `tolerance: 1`, Lunr
edit distance 1; Pagefind and FlexSearch have none). `r4-native` (fa-full + native, no
rescue) and `r4-both` (rescue + native) vs `fa-rescue`. Expected: native alone lifts typo
rows on these OR engines (Phase 0 tuned MiniSearch reached 95–100 on wiki typo rows) but
does nothing for wrong-keyboard rows, and costs canonical MRR (every term also matches
its neighbours; Persian has many 3–4-letter words one edit apart). `both` has the best
typo recall; whether its canonical/MRR cost blocks decides each adapter's recommendation.
Orama with tolerance is slow (Phase 0 tuned Orama took 2.5 h), so its cells are dev only.

**R5: sound-alike index key** (PLAN's "last-resort Soundex"). `r5-soundkey`: every index
term also indexes its folded key; an unknown query term is replaced by its key when the
index knows it (bench/lib/soundkey.ts), before the speller. Expected: homophone about as
good as the speller's sound-alike costs, fewer bytes downloaded (homophone queries no
longer need word pieces), other typo rows unchanged, canonical unchanged; costs index
size, and folding merges distinct words (سد/صد, حال/هال) into one key, so homophone MRR a
little lower than the speller's single best word.

**R6: distance 2** for words of ≥ 6 letters (`r6-edits2`). Expected: little gain (every
generator makes one edit; only typo-uniform on long words and some combined cases
benefit), more false fixes (ff-real up) and more wrong fixes on wiki's large vocabulary:
lose.

**R7: word list** of words used ≥ 2 times (`r7-min2`) vs every word. Expected: about half
the bytes (half of a site's words occur once), and a recall loss where the target's word
is rare: product titles (unique brand and model words), and wiki/news titles' rarest
words, which is what known-item queries are made of: lose on recall, win on bytes.

### Added before the first arm runs (2026-09-27): two rules found in the first `fa-rescue` dev runs

A first look at `fa-rescue`'s in-browser dev runs (before any arm) showed two failure
patterns, each a hypothesis to test rather than a default:

**R8: full edits at 3 letters.** The design rule "3-letter words: sound-alike swaps only"
leaves every typo-delete that ends at 3 letters unfixed («بنج» for «برنج», «احر» for «احمر»,
«بتر» for «بدتر»). Arm `r8-short`: 3-letter words get the full distance 1. Expected:
typo-delete up (a few points on news and products, where titles are short words), small
gains elsewhere; ff-short false fixes up sharply (most 3-letter strings are one edit from
some site word), ff-real a little. Likely a loss on the guard.

**R9: suspects.** On a large site a typo is often a word some page also has (the 20k news
pages contain «فصله», «جامع», «اوکی‌ها»), so it is "known", nothing is unknown, and an engine
that needs every word (FlexSearch, Pagefind) finds nothing with no word to fix. Arm
`r9-suspects`: when nothing is found and every word is known, fix the one word whose
closest word the site uses ≥ 10× as often. Expected: FlexSearch and Pagefind typo rows
up (typo-delete and typo-transpose most, +5–15), OR engines unchanged (they rarely find
nothing), false fixes unchanged (a one-word guard query that is known finds something);
more bytes on Pagefind (every word of an empty query needs its pieces).

Also changed before the arms (a bug, not a hypothesis): the keyboard pass took each run's
first known candidate, so a query typed on mac legacy could mix layouts («av» → «شر»,
standard, beside «تحویل», mac) and an engine needing every word found nothing
(FlexSearch news layout-mac-legacy 50 vs layout-isiri9147 84). The rescue now takes the
one layout under which the most runs become known words. The first runs were discarded.

### Added after the guard set's first runs (2026-09-27, before the arms ran)

The first `fa-rescue` runs on the extra set showed two keyboard bugs, now fixed (the
runs were discarded): a key that types nothing on a layout (mac legacy Shift+F) turned
Latin model codes into bare numbers («F41» → «41», a known word), and a key outside the
table left a Latin letter in the "Persian" candidate («BRN» → «‌R»). A candidate must now
keep one character per key and contain no Latin letter. On Pagefind, a Latin fragment
counted as known when it began some Latin word on the site («jd», «vk»), which blocked
the layout fix; a Latin or digit term now has to be a whole word (Persian terms keep
Pagefind's prefix match: exact matching lost 2–7% of correctly spelled words, measured on
the demo index).

The same runs put false fixes of real words that are not on the site at 30–60% (wiki
ff-real 42–59%, ff-name 35–47%), as expected: nothing tells an unknown real word from a
typo except the site's own words. **R10: only cheap edits** (`r10-cheap`, `maxCost: 0.8`:
sound-alike letters, neighbouring keys, doubled letters, a dropped or added long vowel, two
letters swapped; no arbitrary substitution, insertion or deletion). Expected: false fixes
down by a third to a half (many false fixes are an arbitrary one-letter change: کارتاژ →
کارتان, پیکسار → پیکار), typo-delete down sharply (a deleted consonant costs 1), homophone,
typo-adjacent and typo-transpose about the same, typo-uniform down (arbitrary substitutions).

## Phase 3 results (dev split)

Summary tables: `node bench/rescue-report.ts --split dev` → `bench/results/rescue-dev.md` (per
config × engine: canonical, the four typo rows, the keyboard rows, notice rate on rows
spelled correctly, false fixes pooled over the six ff-* types, typo-uniform, word bytes);
per-cell gates: `node bench/compare.ts fa-rescue <arm> --split dev`. Coverage: every arm
on the four in-browser engines × three corpora; on Pagefind every arm on products, and
fa-rescue on all three (a Pagefind wiki or news run with rescue takes 40–90 minutes; R9 on
Pagefind wiki and news is measured by the final run, gated against fa-full). R4 has no
meaning for Pagefind and FlexSearch (no edit-distance tolerance) and ran on the other three.

### fa-rescue vs fa-full (dev): 57+ cells up, none down, nothing blocks

Typo rows (mean of homophone, typo-adjacent, typo-delete, typo-transpose), keyboard rows
(mean of the layout rows), recall@10:

| | wiki typo | wiki layout | news typo | news layout | products typo | products layout |
|---|---|---|---|---|---|---|
| Pagefind | 16 → 73 | 0 → 84 | 21 → 80 | 0 → 93 | 18 → 83 | 5 → 87 |
| FlexSearch | 2 → 70 | 0 → 79 | 2 → 76 | 0 → 82 | 1 → 78 | 0 → 78 |
| MiniSearch | 30 → 80 | 1 → 83 | 98 → 100 | 0 → 99 | 60 → 90 | 21 → 92 |

Orama and Lunr move like MiniSearch. Notice rate on rows spelled correctly: 0.2–1.1%
(clitic-add 2–8%, where recall held or rose; hamza, plural-add, combo ≤ 3%); canonical
unchanged everywhere. Word bytes per weak Pagefind query (gzipped, a cold visitor):
products median 3.3 KB / p95 6.2 KB, news 8.9 / 21.2 KB, wiki 17.0 / 58.3 KB (20,000 long
articles each). False fixes (pooled ff-*): wiki 22.7% (Pagefind) – 31.3% (in-browser), news
19.7–24.7%, products 15.3–19.8%; per type, real words not on the site are rewritten most
(wiki ff-real 42–59% before the keyboard fixes, ff-name 35–47%), digits and Latin least.
As expected, and the price of fixing automatically: nothing but the site's words tells an
unknown real word from a typo. typo-uniform (the circularity guard) rises too, but less
than the generator's typo rows: wiki 26 → 64 (MiniSearch), 0 → 52 (FlexSearch), 10 → 54
(Pagefind).

### R1: trigger "empty" only? **No: an unknown word also makes a search weak.**

71 cells block. On OR engines "empty" throws away most keyboard fixes (news layout rows
99 → 39, products 92 → 46), since another word of the query usually finds something; on
FlexSearch it is identical, as expected. On Pagefind (products) typo rows fall 83 → 75: a
typo'd word is matched through a shorter prefix, so the search is rarely empty. The same
effect nearly removes Pagefind's false fixes (15.3% → 0.7%), because a one-word query of an
unknown real word also finds something by prefix. That is a real alternative for a site
that prefers never to rewrite a correct query; recall wins the default.

### R3: plain edit distance? **No: Persian-aware costs** (but see typo-uniform)

28 cells block (typo rows: wiki −8, products −6, Pagefind products −6). On typo-uniform,
plain is **better** by 2–7 points (wiki FlexSearch 52 → 59, news FlexSearch 64 → 70,
Pagefind products 66 → 69): the circularity the guard was built for. Persian-aware costs
win on the typos the generators model (sound-alike letters, neighbouring keys), which are
the ones people make most (FarsTypo patterns, RESEARCH.md); plain ranking by frequency does
better on arbitrary substitutions. Kept Persian-aware; the gap is reported, not hidden.

### R4: engine-native typo tolerance? **MiniSearch: yes, with or without rescue. Orama, Lunr: no.**

MiniSearch `fuzzy: 0.2` passes the gate alone (vs fa-full, no MiniSearch cell blocks) and
on top of rescue (vs fa-rescue: wiki typo-delete 54 → 75, products 73 → 88, clitic-add
87 → 94; no cell down), and on typo-uniform it beats our speller outright (wiki 64 → 77 with
both, 92 alone), since it keeps every close term instead of choosing one. It fixes no
wrong-keyboard query. Orama `tolerance: 1` and Lunr's edit distance 1 wreck ranking (vs
fa-rescue: 129 cells block, canonical wiki −8 to −10, products −14 to −21): every term also
matches its neighbours and Persian has many short words one edit apart. So the README
recommends `fuzzy: 0.2` for MiniSearch and neither option for Orama or Lunr; the adapters do
not change (a site passes MiniSearch's own option).

### R5: sound-alike index key? **No.** Nothing up, nothing down (0/291 cells), index larger
(every term with a sound-alike letter indexed twice), bytes unchanged on Pagefind products:
the speller's sound-alike costs already find those words, from the site's own list.

### R6: distance 2 for words of 6+ letters? **No.** No cell moves; false fixes +7 to +9 points.

### R7: only words used twice or more? **No.** 18 cells block, all products typo rows
(−4 to −9): a product title's words are often used once on the whole site, and those are
exactly what a known-item search types. Bytes: Pagefind products median 3.3 → 2.6 KB. False
fixes fall 3–4 points. (On wiki and news recall rose by about half a point: rarer words are
more often junk there.)

### R8: full edits for 3-letter words? **No.** +0.1–0.9 on typo rows, false fixes +9 to +13
points (news 24.7 → 33.3, products 19.8 → 33.1): most 3-letter strings are one edit from
some site word.

### R9: suspects when nothing is found? **Yes** (adopted, always on)

vs fa-rescue: 13 cells up, none down (products Pagefind typo 83 → 87, FlexSearch wiki
70 → 73, news 76 → 82), false fixes unchanged (a known one-word query finds something), notice
rate on rows spelled correctly +0.2–1.1 points on FlexSearch and Pagefind only. OR engines
never find nothing, so they are unchanged.

### R10: only cheap edits? **No.** 24 cells block; false fixes fall a third (wiki 31 → 24,
news 25 → 17, products 20 → 12) but typo rows lose 4–12 points and typo-uniform collapses
(wiki FlexSearch 52 → 6): arbitrary one-letter mistakes are common in the guard set, and
cheap edits cannot reach them.

**Decisions:** the rescue ships with the unknown-word trigger, Persian-aware costs at
distance 1, every word in the list, sound-alike swaps only at 3 letters, and suspects on.
The options the arms needed (trigger, plain costs, distance 2, minimum count, 3-letter edits,
maximum cost) and the sound-key wrapper are removed from the code; their configs are removed
from bench/configs.ts (the runs stay in bench/data/runs), as in earlier phases.

**After the decisions (before the final runs):** two fixes found while removing the arm
options, measured by the final runs rather than by a new arm. (1) R9's rule as run also let a
word the index knows but the word list lacks (an inflected form: «کتابخانه» next to the list's
«کتابخانه‌ی») count as a suspect with count 0; a suspect is now a word of the list, as the
hypothesis states. (2) The keyboard pass dropped a few more non-words: a letter key that types
no letter on a layout (Shift+S → «»», a Latin model code «S70» → «»70») and a run with digits
and fewer than three letters. Both only remove rewrites.

## Phase 3b: suggest, don't replace (owner decision, 2026-09-28)

The owner found replacing a search with another word odd for a site search, and the
false-fix rows agree (real words not on the site rewritten 24–59%). New default: a
**keyboard** fix still replaces the search (near certain; Latin names and codes were
rewritten 0–5%); a **spelling** fix is offered as a suggestion ("did you mean «…»?") with the
results as typed, and replaces the search only when the words as typed find nothing.
`fa-rescue` now measures that; the previous behaviour is arm **R11** (`r11-replace`, every
fix replaces the search, emulated in the bench wrapper; its runs are the first `fa-rescue`
runs, renamed). The bench records each suggestion and whether its results hold the target,
so "one click" recall = found as shown or through the suggestion.

**Expected (written before the run):** keyboard rows unchanged against R11. Typo rows, as
shown: FlexSearch about unchanged (a typo there usually means nothing found, so the fix
still applies); MiniSearch, Orama and Lunr back near fa-full on multi-word queries (the other
words find something); Pagefind back near fa-full (it matches the typo by a shorter prefix,
so something is found). "One click" recall ≈ R11 everywhere. False fixes: unchanged on the
in-browser engines (a one-word guard query finds nothing, so its fix still applies), near 0
on Pagefind; they become false suggestions instead. Notice rate on rows spelled correctly
lower; canonical unchanged. Reported on dev and on test (the test split was read once for
Phase 3; this is a product decision taken afterwards, not tuning, and both numbers are shown).

### Phase 3b results

Runs: `fa-rescue` (suggest) over every query and the extra set; `r11-replace` (the first
fa-rescue runs). Tables: `node bench/rescue-report.ts --split test --configs
fa-full,r11-replace,fa-rescue` → rescue-test.md (and rescue-dev.md). Test split, typo rows
(mean of the four), wiki / news / products:

| | Pagefind as shown | Pagefind one click | MiniSearch as shown | MiniSearch one click | FlexSearch |
|---|---|---|---|---|---|
| R11 (every fix replaces) | 76 / 81 / 83 | – | 80 / 99 / 89 | – | 73 / 78 / 78 |
| fa-rescue (suggest) | 28 / 71 / 74 | 76 / 81 / 83 | 78 / 98 / 63 | 80 / 100 / 89 | 73 / 78 / 78 |

(Orama and Lunr move with MiniSearch.) As expected: keyboard rows identical; FlexSearch
unchanged (a typo there means nothing found, so the fix still applies); "one click" equals
R11 everywhere. Pagefind drops furthest as shown: it matches a typo'd word through a shorter
prefix, so something is found and the fix becomes a suggestion (wiki homophone 89 → 27 as
shown, 89 with one click). MiniSearch, Orama and Lunr keep most typo rows as shown on wiki and
news, where a typo'd query usually finds nothing, and drop on products (89 → 63), where the
other words of a product title find something.

Rows spelled correctly are searched as a fix 0–0.7% of the time (R11: 0.3–1.7%) and offered a
suggestion 0–1.6%. **False fixes** (the guard set): Pagefind 21.7 / 17.7 / 14.6% → **1.2 /
2.2 / 1.3%** (they became suggestions: 20.5 / 15.4 / 13.2%). In-browser engines unchanged
(28.1 / 21.7 / 16.9%): a one-word guard query for a real word the site does not have finds
nothing there, so under the rule "replace only when nothing is found" its fix still applies,
with the notice. A stricter setting (never replace a spelling fix, only suggest) would bring
them to 0 as well; not built, the owner's call.

Gate `fa-full → fa-rescue` (test): 335 cells, **93 up, 0 down, 0 blocking**. Against R11
(dev) 45 cells block, all typo rows as shown, by design: those queries now get the suggestion
instead of the replaced results. **Decision: suggest is the default** (owner decision; the
measurements hold no surprise against it).

---

# Phase 4b: an optional word-root model (`fa-search-kit/lemma`)

The plan (owner-approved 2026-09-28): a small model behind the lexicon links forms the
rules miss («نویسندگان» → «نویسنده», «حملات» → «حمله», «ابتدای» → «ابتدا», verbs the lexicon
lacks). It predicts an edit (strip a verb prefix, cut letters, append) or defers; the
lexicon always wins; when it defers the output is fa-full's. Trained only on clean data
(Hazm verbs, MIT; our vocabulary counts; LLM labels of our own word list). UD and Hazm's
lemmatizer are comparison arms only. Ships only if it finds more without wrong merges;
if a plain list of the same size does as well, the list; if nothing helps, nothing.
Tools: `bench/lib/lemma.ts` (targets, splits by lemma, the UD oracle),
`bench/lemma-eval.ts` (offline, UD), `bench/lib/lemma-sets.ts` (the lemma query set),
`scripts/lemma/` (edits, the lexicon wrapper, the models).

## CP0: headroom (2026-09-28)

**Target.** A verb's (ن)+past stem (PerDT only; preverb kept: «برخاستند» → «برخاست»);
any other content word the term fa-full gives its gold lemma; function words (AUX, PRON,
ADP…) keep fa-full's term, so the model can only lose there.

**Where fa-full misses the target** (`node bench/lemma-eval.ts --baseline --split all`,
bench/results/lemma-baseline-all.md; PerDT tokens): NOUN 18.0k of 167k (10.7%), ADJ 3.0k
of 35k (8.6%), VERB 5.6k of 54k (10.3%). Causes: ezafe/indefinite ی joined to the word
9.1k nouns + 1.8k adjectives + 0.4k names; verbs outside the lexicon 4.2k, and 1.4k forms
of lexicon verbs the lexicon refuses on purpose («کنیم», «کردی»: bare forms read as nouns);
ان/یان plurals 2.3k; comparatives 0.9k; clitics 0.9k; ات 0.7k; گان 0.4k. Seraji: nouns and
adjectives 8.7%, the same causes. One lexicon slip found on the way: «می‌زد» → «می‌زید»
(«زد» is not a lexicon past stem, so the present-stem path reads ز+د); the model cannot fix
it (the lexicon wins), noted for a later lexicon pass.

**The lemma query set** (`node bench/lemma-queries.ts`, written before any arm ran): every
canonical query (supplementary targets included) gets at most one variant per class, one
token swapped for another UD-attested, vocabulary-attested form of its one UD lemma; pairs
that differ only by the ها plural are left to the main set. wiki 639, news 1,315, products
1,344 queries; nouns dominate (ezafe ی, clitic, «other» stem changes, ات, ان/یان), adjectives
~170 per corpus, verbs 7 / 101 / 6. Every lemma in the set occurs in UD's train files, so
the UD-trained arm is optimistic on the whole set (no unseen rows to split out).

**Expected (written before the benchmark runs).**
- *Main set, lm-oracle-ud vs fa-full (dev).* Mostly a no-op: no generator adds ezafe ی,
  ات, گان or comparatives. Small ups possible on verb-tense-ud (PerDT verbs the lexicon
  lacks) on Pagefind and FlexSearch, and on plural/clitic rows where the page's word is an
  ezafe or ان form. Risk: OR engines' ranking when a common lemma absorbs more forms; we
  expect no blocking cell and moves within ±1 point.
- *Lemma set.* fa-full on Pagefind and FlexSearch (every word must match) misses most
  ezafe/ات/ان/گان/comparative swaps; the oracle recovers most of them: morph-ud-noun and
  -adj +5 to +15 points there. OR engines already find most rows through the other words:
  recall moves little, MRR rises.
- *Conflation (UD dev files, measured first):* UI falls sharply for nouns and adjectives.
- *Conflation (UD dev files; `node bench/conflation.ts --configs fa-full,lm-oracle-ud --base
  fa-full --splits dev`):* UI falls sharply for nouns and adjectives. Measured before the
  benchmark: see below.

### CP0 results: the headroom is real (dev)

| | fa-full | lm-oracle-ud |
|---|---:|---:|
| Seraji UI % / OI ×10⁶ | 56.7 / 57.5 | 44.3 / 64.3 |
| PerDT UI % / OI ×10⁶ | 57.7 / 51.6 | 49.7 / 53.2 |
| PerDT UI NOUN / VERB / ADJ | 42.4 / 60.3 / 59.9 | 16.4 / 55.9 / 29.0 |

**Lemma set** (`compare.ts fa-full lm-oracle-ud --set lemma --split dev`): 35 cells, **20 up, 0
down**. morph-ud-noun on Pagefind 64 / 58 / 84 → 93 / 96 / 96 (wiki / news / products),
FlexSearch 55 / 43 / 57 → 93 / 96 / 97; OR engines 84–99 → 90–100 with MRR up (wiki
MiniSearch 75 → 93). By subtype the gain is ezafe ی (Pagefind 43 → 99, FlexSearch 31 → 98),
«other» stem changes (22 → 73), other endings, ان/یان (50 → 100), ات on FlexSearch (55 → 100);
verbs 83 → 87 (few rows: the lexicon already covers most). **Main set** (dev): 335 cells, 0 up,
0 down, nothing blocks; the moves are within 1–2 points both ways (verb-tense-ud news
Pagefind 84 → 91, FlexSearch 82 → 91; plural-add news Pagefind 98 → 96), as expected.

**Not expected: even the gold oracle raises OI** (Seraji 57.5 → 64.3, PerDT 51.6 → 53.2). The
wrong merges it adds over fa-full (bench/results/conflation-lm-oracle-dev.md) are mostly the
gold's own inconsistencies, not errors: the same form lemmatized two ways in different
sentences («آمریکای» as آمریکای and as آمریکا; «دیگری» as دیگری and دیگر; infinitives and
participles with lemmas of their own, «کردن» apart from «کرد»), so merging a form into its
dominant lemma counts every minority reading as a wrong pair. Some are real and would be
real for any model: «بهتر» → «به» (PerDT lemmatizes the comparative to «به», which is also the
preposition), «سالمی» → «سال» (fa-full's own term for «سالم» is «سال»). **Consequence for
CP3:** the gate "OI ≤ fa-full's on both treebanks" cannot be met by gold labels, so it would
stop any model that fires at all; a UD-trained tree passes it only at τ = 0.9, where it fixes
77 dev tokens. Recorded here before the trained arms ran; the gate question goes to the
owner with the trained model's numbers.

**Stop point:** does the oracle move a target cell and lower UI? Yes (20 cells, UI NOUN
42 → 16). Continue.

## CP1: labels

**Refactor.** Vocabulary normalization, `count`, `pluralizable` and the verb pairs moved from
`scripts/build-lexicon.ts` to `scripts/lib/mine.ts`; the builder's output is byte-identical
to the old builder's. Found on the way: the committed `src/lexicon/data.ts` is 7 words
behind its own builder (the builder now also keeps «میزگرد», «میتانی», «میبدی», «میردامادی»,
«میانرود», «مینوسی», «میثاقی», because the joined-«می» rule fallback of commit 5e87260 changed
what the aggressive analyzer strips); left as committed (a lexicon change needs its own gate).

**Mined labels (M,** `node scripts/build-lemma.ts --mine`, bench/results/lemma-mined.md).
Verbs: every Hazm pair conjugated, perfect included, 2,807 forms (a form two verbs share,
a noun, or an unprefixed form of a noun stem dropped; «بیستم» dropped as the lexicon drops
«بیست»). Nominals: X+σ → fa-full's term for X under count tests; look-alikes (a word that takes
a plural or nisba ی of its own, or is spelled as a compound: «ماهی», «مهمان», «کرمان»,
«کم‌کم») defer. **Checked against UD, only two classes reach the mined-only bar (90% of ≥ 30
UD-checked fires): verbs 98.1% and comparatives 97.0%.** The noun classes fall below and are
dropped from M (their candidates go to the LLM queue instead): ezafe ی after a consonant
54% (nisba adjectives: «احتمالی», «سراسری», «دلاری» are words of their own in UD), یی after a
vowel 20% (abstract nouns: «رهایی», «بینایی»), ezafe after a vowel 73–76% (partly UD
conventions: broken plurals «شهدای» → شهید, prepositions «جلوی»), ات 81%, ان/یان 84% (names:
«کرمان», «مهران», «طالبان»; adjectives «هراسان»), گان 88% («مهرگان», «تیرگان»), ها 87%. The clitic
and ین candidates were never labels (the rules handle clitics; mined ones were mostly
names: «ایشان», «آیدین»). A count-ratio rule, a nisba test and a compound test were each
added after reading the misses; none lifts a noun class over the bar.

**LLM labels (L,** `node bench/lemma-llm.ts --merge dev-91432d40888a,bulk-91432d40888a`,
bench/results/lemma-labels.md, provenance bench/results/lemma-llm-manifest.json). Prompt
bench/lemma-llm/prompt.md, developed on 300 dev-lemma words with UD answers and frozen
(hash 91432d40888a) before bulk labelling; it was not changed after the development
round (Claude alone 92.4% of its merges right against UD, luna 95.5%, both agreeing 95.4%,
κ 0.85). Queue: 23,954 words of our vocabulary (mined candidates the miner could not decide
or that failed its bar, seen ≥ 10 times; look-alikes ≥ 20; every mined comparative; unmined
words seen ≥ 100 times that look inflected), in 40 shards; luna (gpt-6-luna, xhigh, one fresh
Codex session per shard) and Claude (one subagent per shard), same prompt and contract.
Result over 24,254 words: **agreement 91.0%, κ 0.82** (merge vs defer); 7,502 accepted
merges, **95.8% right** on the 3,411 that UD can check (≥ 1000 uses 97.8%, 100–999 95.3%,
20–99 95.1%). By class, the ezafe ی after a consonant (94.0%), after a vowel (92.3%) and ات
(88.2%) fall under the 95% bar and are **dropped from L** (not used at all); clitics 97.5%,
ان/یان 96.6%, ین 96.7%, comparatives 100%, look-alikes 96.6%, unmined 95.9%, گان 95.1%,
verbs 100%. Dropping the ezafe classes removes the largest share of the headroom measured
at CP0 (9.1k PerDT noun tokens): whatever the model gains on nouns now comes from plurals,
clitics and comparatives.

Two merge rules settled while reading the disagreements (before any model trained): the
families agree when they give the same **term** (luna gave «می‌کشد», «کشیدند» the right past
stem but kind "noun", «خواهند» kind "function"); such a word is a verb when either family
says so and the lemma is a Hazm past stem. A duplicate luna pool (started before shard
locks existed) re-ran four finished shards; it was stopped, and the finished files kept
(checked: 600 valid rows each).

**Adjudication** (bench/results/lemma-adjudication.tsv, my verdicts on 200 random
disagreements, before the kind rule above): Claude right 128, luna right 68, neither 3
(«دوامی» → دوا, «زایدی» → زاد, «پیشینش» → پیش), 1 not a real disagreement (the duplicate-pool
artefact). Luna's errors are mostly **missed merges** (97, e.g. «کشتی‌های», «لباستان»,
«واحدهایی», «پمپی»; its wrong merges, 34, include garbage targets: «پولانسکی» → ویکیپدیا,
«صاف‌تر» → مضر). Claude's are 46 missed, 25 wrong merges (joined prepositions and verbs
«بعمل», «بدوش», «برخواهد»; nisba adjectives «هتلی», «وجهی»). So the agreement rule mostly costs
coverage (luna defers a lot), not precision.

## CP2: models offline (dev) — **a plain list matches the models; the tree only wins on unseen words, imprecisely**

`node scripts/build-lemma.ts --sweep` (bench/results/lemma-models.md). On UD dev tokens, M+L
labels, against fa-full (fixed / broken, net):

| size | tree (A) | linear (B) | list (C) |
|---:|---|---|---|
| 5 KB | +448 / −198, net 250 | does not fit | +364 / −108, net 256 |
| 10 KB | +509 / −203, net 306 | +199 / −251, net −52 | +412 / −113, net 299 |
| 25 KB | +543 / −209, net 334 | +423 / −185, net 238 | +433 / −115, net 318 |

The tree reaches unseen words (pair-dev coverage 36–38%) but with 17–19% wrong edits and
4–6% false fires; with a threshold that brings it to the list's error level it loses (10 KB,
τ 0.6: +248 / −78, net 170, unseen coverage 6%; τ 0.8: net 69). The linear model is behind
everywhere and does not fit 5 KB. Label sources: M alone gives almost nothing (mined nouns
failed their bar; the verbs are mostly already lexicon verbs): tree net −12 to +1; L alone
fires too often (no mined negatives; tree 5 KB +558 / −541); U (UD train, comparison only)
tree 5 KB +1005 / −199 and list +875 / −28, the ceiling clean labels miss mostly because
the ezafe ی classes were dropped; H (Hazm's lemmatizer, comparison only) breaks more than it
fixes (tree 25 KB +334 / −544).

**Decision (pre-registered rule): "more words beat a model".** C matches A at equal bytes
and does it with half the broken tokens, so there is no `/lemma` model; the list becomes a
lexicon experiment (15 KB budget; the lexicon is 7.8 KB). The active-learning round (meant
to improve a model's uncertain region) is not run. Arms: `lm-list` (5 KB), `lm-list-7`
(7 KB) through the same wrapper (a list is a lexicon lookup), `lm-tree` (10 KB, τ 0.6) kept
for reference.

## CP3: conflation (UD dev files)

`node bench/conflation.ts --configs fa-full,lm-list,lm-list-7,lm-tree --base fa-full --splits
dev` (bench/results/conflation-lm-dev.md):

| | Seraji UI / OI | PerDT UI / OI | PerDT UI NOUN / VERB / ADJ |
|---|---|---|---|
| fa-full | 56.7 / 57.5 | 57.7 / 51.6 | 42.4 / 60.3 / 59.9 |
| lm-list (5 KB) | 53.3 / 59.2 | 55.1 / 52.5 | 38.2 / 58.3 / 53.1 |
| lm-list-7 | 52.8 / 59.8 | 54.5 / 53.2 | 37.1 / 57.9 / 51.9 |
| lm-tree (τ 0.6) | 54.3 / 59.5 | 56.1 / 52.9 | 40.1 / 58.7 / 56.8 |

The target (UI down ≥ 2 points on PerDT NOUN or VERB) is met by the list (−4.2 NOUN). The
gate as written (OI ≤ fa-full's on both treebanks) fails, as it failed for the gold oracle
(CP0): of the 16 Seraji pairs the list adds, most are the gold's two readings of one form
(«آمریکای» and «آمریکا», «اروپای», «جهانیان» apart from «جهانی», «کردن» apart from «کرد»); one
comes from fa-full itself («نامه‌ای» → نام, because fa-full's term for «نامه» is «نام»). Taken
to the owner with the benchmark numbers; the benchmark runs on dev meanwhile.

## CP4: benchmark (dev)

`compare.ts fa-full <arm> --split dev` and `--set lemma`:

| arm | main set (335 cells) | lemma set (35 cells) |
|---|---|---|
| lm-list (5 KB) | 0 up, 0 down, 0 blocking | 3 up, 0 down |
| lm-list-7 | 0 up, 0 down, 0 blocking | 3 up, 0 down |
| lm-tree (10 KB, τ 0.6) | 0 up, 0 down, 0 blocking | 2 up, 0 down |

Small gains, all on the plurals the clean labels kept: morph-ud-noun news Pagefind 58 → 61,
FlexSearch 43 → 49; by subtype ان/یان Pagefind 56 → 67, FlexSearch 37 → 56; گان dropped forms
0 → 100 (2 rows). The oracle's gain (news noun 58 → 96) was mostly the ezafe ی and «other»
stem changes, which the clean labels do not have. (One products/Pagefind job failed with the
known Pagefind metadata load error and was re-run.)

### Owner decision (2026-09-28): try to recover the ezafe ی before deciding

No stricter acceptance rule on the existing labels lifts the ezafe classes over 95% against
UD (tuned on UD train+dev words only): both families' share = 1: 94.2%; count ratio
X+ی / X ≤ 0.1 and share = 1: 94.5%; X seen ≥ 200 and ratio ≤ 0.2: 94.4%. **Reading the
disagreements instead** (UD train+dev, all 48 of the two classes): most are UD conventions,
not label errors: UD keeps the indefinite ی in the lemma («معبدی», «حاصلی», «موافقتی», «طویلی»
as ADJ), keeps a broken plural as its own lemma where our rule asks for the singular («مبالغی»
→ مبالغ, «شروطی», «اقشاری»), or its lemma is the form itself with the ezafe («مجرای», «دورنمای»,
«انقضای»). Wrong by our definition: 5 of 35 after a consonant («هیچی», «خاری», «بازدیدی»,
«محملی», «چنانی») and 1 of 13 after a vowel («باروی»), so ≈ 99% of the UD-checked merges are
right by the target the model is meant to learn. ات stays dropped (its misses are real:
«معلومات», «انتظامات» are words of their own). This is an adjudication, not a rule chosen
before the data; the arm that uses it is named for it (`M+L+ez`, arms `lm-list-ez`,
`lm-list-ez-7`) and the owner decides whether it ships.

Offline (UD dev tokens, against fa-full): lm-list +364 / −108; **lm-list-ez +523 / −131**
(nouns +430 / −21); lm-list-ez-7 +558 / −133. Conflation (UD dev): PerDT UI NOUN 42.4 →
38.2 (lm-list) → **35.0** (lm-list-ez) → 34.5 (-7); OI the same as lm-list (PerDT 52.4,
Seraji 59.8, fa-full 51.6 / 57.5).
Benchmark (dev), same gate: lm-list-ez main set 335 cells 0 up / 0 down; lemma set **8 up**,
0 down (news nouns Pagefind 58 → 65, FlexSearch 43 → 53; ezafe rows Pagefind 55 → 60,
FlexSearch 31 → 39); lm-list-ez-7 9 up. **Owner decision: ship the smaller list, without the
ezafe ی** (the labels that passed the bar mechanically).

## Review of the added merges (the owner's gate in place of "OI never higher")

Reading the tokens the chosen list breaks against fa-full on UD dev and test found two real
faults, both from the lexicon being keyed by the bare word (ZWNJ removed):

- **Half-space collisions:** «نامهای» is both «نام‌های» (names) and «نامه‌ای» (a letter), and
  «دستهای» is both «دست‌های» and «دسته‌ای». One list entry served both, so «نامه‌ای» became
  «نام». Rule: skip a word when an attested half-space spelling (≥ 5% of its uses) splits
  it elsewhere than its label, either after the lemma or before a bare ending.
- **Stop words:** «آنها» → «آن» ("they" is not "that"). Rule: never a Hazm stop word.

After the fix (UD dev): 310 fixed and 47 broken, against 364 and 108 before. The remaining
breaks are defensible: «اروپای» → «اروپا», «بالای» → «بالا», the future «خواهم» → «خواست»
(UD's own lemma), and «هزاران» → «هزار». Conflation (UD dev): PerDT UI NOUN 42.4 → 37.9;
OI PerDT 51.6 → 52.0, Seraji 57.5 → 58.2; with verb families PerDT OI unchanged (30.2).

These fixes were made **after** one test read of the treebanks (UD test files, before the
fix: 325 fixed, 131 broken; nouns 257 / 8). That UD test number is therefore not a clean
read for the fixed list. The benchmark test read below was taken once, after the fix.

## CP5: test, once

`compare.ts fa-full lm-list --split test` (and `--set lemma`), `compare.ts fa-rescue
lm-list-rescue --split test`:

- main set: 335 cells, **0 up, 0 down, 0 blocking**;
- lemma set: 35 cells, **1 up** (news nouns FlexSearch 49 → 53), 0 down. By subtype on the
  engines that need every word: ان/یان Pagefind 83 → 90, FlexSearch 63 → 77; گان FlexSearch
  38 → 75; dropped ان/یان FlexSearch 45 → 73. OR engines move ±1 (Orama ان/یان 97 → 90 is
  2 queries of 30, not significant);
- rescue guard: false-fix rows unchanged (at most 1 query in 150 more, on ff-real and
  ff-name);
- dev, for reference: main 0 / 0; lemma 3 up.

**Pass** (no blocking cell, a target cell up).

## CP6: shipped in the lexicon

- `scripts/build-lemma.ts --emit lm-list` writes `src/lexicon/lemmas.ts`: 579 words and 30
  edits, 2.9 KB gzipped on its own.
- `createLexicon` reads it behind the verb list, keep list and broken plurals, which
  always win.
- Left out: the entries those lists decide anyway, and 10 whole-word replacements. The
  replacements are broken plurals such as «ابیات» → بیت: `applyEdit` keeps at least one
  letter, so they never fired in the tested arm.
- Checked: the shipped lexicon gives the tested arm's terms on every vocabulary word
  under the default, `negation: "merge"` and `verbs: "stem"` settings (0 of 802,416
  analyses differ), and two builds are byte-identical.
- Sizes: core 4.95 KB, unchanged; lexicon 7.83 → **10.83 KB** (budget 15); every adapter
  unchanged.
- Benchmark bookkeeping: `fa-full` / `fa-rescue` now carry the list. Their earlier runs
  are kept as `fa-full-p3` / `fa-rescue-p3`, and the arms of Phases 1–3 pinned to that
  lexicon. The new `fa-full` runs are the `lm-list` runs, copied (the shipped lexicon is
  identical to the arm). `fa-rescue` is re-run on the main set.

Not done, recorded:

- the active-learning round (it was for a model, and there is none);
- the held-out-verb pair of arms (a list cannot reach verbs it never saw, by construction);
- labels ات and ezafe ی (owner's choice);
- the whole-word broken plurals («ابیات», «اجرام», «اذهان», «اوزان»…): a candidate for the
  hand-written `PLURALS` list, gated on its own.

### Follow-ups after shipping (2026-09-28)

Gated against `fa-full-4b` (the lexicon as shipped, snapshotted in bench/lib/lexicons/p4b.ts;
Phase 3's in p3.ts, so `fa-full-p3` and the arms of Phases 1–3 stay reproducible):

- **Two shadowing verbs dropped.** Hazm's «میزیدن» (present میز) and «می‌راندن» (میران) read
  «میزد», «می‌زند», «می‌راند» as their own forms, because the lexicon tries no prefix before
  «می» (the CP0 slip «می‌زد» → «می‌زید»). Rule in scripts/lib/mine.ts: drop a verb whose
  present stem starts with «می» when more than half of its attested forms, including the
  bare 3rd-person present the lexicon accepts, are «می» + another listed verb's form.
  Dropped: those two; «مردن» (میر) stays.
- **Four broken plurals** added to `PLURALS` («اجرام», «اذهان», «ابیات», «اوزان»), found by the
  labellers as whole-word edits. «اشکالات» was already right; the labels' «شکل» was wrong.
- **The 7 keep words** the builder had produced since 5e87260 are now shipped.

Result: 38 vocabulary words analyse differently. `compare.ts fa-full-4b fa-full`, dev and
test, main and lemma sets: 0 up, 0 down, **0 queries found → lost**. Conflation
(bench/results/conflation-4b-fixes.md): UI −0.1 to −0.2 on both treebanks, OI equal, one
added wrong merge («نمی‌زد» → «نزد», the kept-negation term that «نزدند» already shares with
«نزد» "near"). Rescue: `fa-rescue-p3 → fa-rescue-4b` (test) 0 up, 0 down, false fixes
unchanged; fa-rescue re-run with the fixes.
