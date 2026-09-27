# Snowball Persian: issue / PR drafts (not sent)

Drafts for `snowballstem/snowball` (algorithms/persian.sbl, 3.1.1) and
`snowball-data`, from fa-search Phase 1. **Nothing here has been sent**; each needs
the maintainers' format (a written reason per rule, Latin transliterations, test
vocabulary under an OSI licence; RESEARCH.md §1 "Contributing to Snowball").

Evidence sources: `bench/conflation.ts` on UD Persian-Seraji and PerDT gold lemmas
(evaluation only: CC BY-SA, cannot go into snowball-data), and the fa-search
known-item benchmark (`bench/results/experiments.md`). For snowball-data, test words
would have to come from an OSI-licensed list instead.

---

## 1. Derivational suffixes over-stem (strongest evidence)

**Behaviour** (3.1.1): the suffix loop strips derivational endings with the
inflectional ones: «دستگاه» (dastgāh, device) → «دست» (dast, hand), «زندگی»
(zendegi, life) → «زند», «ماهیت» (māhiyat, nature) → «ماه» (māh, moon),
«کارمند» (kārmand, employee) → «کار» (kār, work), «سالانه» → «سال».

**Proposal:** strip only inflection (ها، ان، ات، گان، یان، ین، تر، ترین، ی، های، ام، اش…)
in the default algorithm; leave گاه، مند، وار، گار، بان، انه، ناک، انی، یت، گی، یی on.

**Evidence:** keeping them cuts wrong merges (Paice OI) by 40% on both treebanks
(Seraji 25.0 → 14.7, PerDT 18.9 → 12.1 ×10⁻⁶) for +0.5 points of under-stemming,
and changes no cell of a 335-cell retrieval benchmark (no significant change in
either direction, BH-adjusted).

## 2. A half-space before a closed suffix should bound the stem

**Behaviour:** `Delete_ZWNJ` runs before suffix stripping, so the half-space that
marks «نامه‌ای» (nāme-i, a letter) as noun + suffix is lost and the word is read as
«نامهای» → «نام» (nām, name); «خانه‌ای» → «خان», «خسته‌اید» → «خست».

**Proposal:** when the word ends in ZWNJ + {ی، ای، ام، ات، اش، ایم، اید، اند، ها،
های، هایی}, stem only the part before the ZWNJ.

**Evidence:** heh-yeh variant row («نامه یعقوب» searched as «نامه‌ی یعقوب»):
FlexSearch 14 → 100, Pagefind 39 → 100 recall@10 (wiki). Needs a companion for the
joined spelling: people also write «قهوهای» for «قهوه‌ای», which the algorithm reads
as plural «قهو». fa-search solves that at index time (H5b); inside a stemmer it
cannot be decided from the word alone. Worth stating in the description.

## 3. Fold ۀ and the hamza-above mark

**Behaviour:** `Normalize_Characters` folds U+06C1 (heh goal) but not U+06C0 (ۀ)
or «هٔ» (heh + U+0654), both common spellings of the ezafe after silent heh:
«نامۀ» and «نامهٔ» stay unstemmed and never meet «نامه».

**Proposal:** add ۀ → ه and delete U+0654 (and the other harakat, as the Arabic
stemmer does).

**Evidence:** part of the heh-yeh row gain above; `bench/collisions.ts` finds 643
vocabulary groups the fold merges, reviewed by hand: all are spellings of one word.

## 4. Person endings after a prefix depend on R1

**Behaviour:** «می‌کند» → «کند» but «می‌کنند» → «کنن»; «می‌روم» → «روم»: the
3-letter R1 minimum blocks the ending exactly on the most frequent verbs, whose
present stems have 1–2 letters (کن، رو، شو، ده).

**Proposal:** after a present prefix (می‌/نمی‌), allow person endings down to a
2-letter stem.

**Evidence:** conflation only (verb UI); a retrieval gain needs present→past stem
mapping, which is a lexicon job outside Snowball (fa-search does it in its lexicon).

## 5. Joined «می»

**Behaviour:** «می» is stripped only after a ZWNJ, so «میکند» (typed without the
half-space, as most people do) stays whole while «می‌کند» → «کند». In retrieval
this is a regression against no stemming at all for engines that require every
query word: Pagefind news zwnj-join 100 → 61 recall@10 with Snowball plugged in.

**Proposal:** strip a joined «می»/«نمی» when what follows ends like a verb (a
person ending, or the past stem's ت/د), with an exception list of non-verbs
(میلادی، میزبان، میدان، میکرو…).

**Evidence:** H2: news zwnj-join Pagefind 61 → 99, FlexSearch 57 → 97, no cell down
(335 cells). The exception list fa-search uses is mined from corpus counts (words
whose half-space spelling is never attested); for snowball-data it would need
rebuilding from an OSI-licensed word list.

## Not proposed

- Negation (نمی/ن): stripping it lifts negated-verb recall from 7–11 to 99, but
  raises over-stemming above Snowball's own in our conflation check, and the
  precision cost the maintainers named is invisible to known-item search. No
  proposal without graded judgments; the maintainers' choice stands for now.
- مان/تان/شان: stripping them wins big (clitic-add FlexSearch 17 → 71 wiki), but only
  with a keep list of real words (فیلم، کفش، زمان…); a rule alone costs a blocking
  regression. Consistent with the maintainers' "needs a lexicon"; not proposable to a
  lexicon-free algorithm.
