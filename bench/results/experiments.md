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
  rule fallback is free insurance. Not switched after the test split was read (the
  reported numbers are for the shipped default); first thing to revisit.
