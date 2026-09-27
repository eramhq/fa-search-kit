# Data shipped in the package, and where it comes from

Rule (CLAUDE.md): ship only MIT/BSD/Apache data; CC BY-SA, ODbL and GPL data is for
evaluation only. This file lists every piece of data that ends up in the bundles.

| data | file | source | licence |
|---|---|---|---|
| Snowball Persian stemmer (generated code) | `vendor/snowball/` | snowballstem/snowball v3.1.1 | BSD-3-Clause (`vendor/snowball/COPYING`) |
| Present → past verb stems (356 pairs) | `src/lexicon/data.ts` `VERBS` | Hazm `verbs.dat`, rev `a399c829`; pairs with < 20 uses of all their forms dropped | MIT |
| Broken plurals (103 pairs) | `src/lexicon/data.ts` `PLURALS` | written by hand for this project (`scripts/build-lexicon.ts`), kept when the plural is attested | project's own (MIT) |
| Keep list (1,040 words) | `src/lexicon/data.ts` `KEEP` | **selected by rules from word counts** (see below) | see below |
| Protected words (23) | `src/words.ts` `PROTECTED` | Snowball's own ان exceptions (folded) + words selected like the keep list, + 2 by hand | see below |
| Joined-«می» exceptions (46 entries) | `src/words.ts` `MI_EXCEPTIONS` | selected by rules from word counts | see below |

## The word lists selected from counts

`scripts/build-lexicon.ts` reads `bench/data/vocab.tsv`: how often each word form occurs
in the benchmark's raw sources (Persian Wikipedia 2023-11 shard, CC BY-SA; pn-summary
news, card says MIT; Digikala product titles, card says MIT). Only single words and
their counts are used, never text. A word is kept when rules say so: it takes a
plural itself (مهمان‌ها → مهمان is a word, not مه + مان), a negated form is rarer than
its positive, a «می» word's half-space spelling is never attested, and so on. The
output is a list of ordinary dictionary words, not text from the sources.

**Open decision (owner):** whether a word list chosen this way may ship under MIT.
The usual view is that single words and the fact of their frequency are not
copyrightable, but the counts come in part from CC BY-SA text. If that is not
acceptable, the same rules can run over counts from an MIT/public-domain corpus
instead; the lists would need rebuilding and the benchmark rerunning. Hazm's
`words.dat` was deliberately not used: whether it derives from Bijankhan (GPL) is
unchecked.

Evaluation-only data (never bundled): UD Persian-Seraji and PerDT (CC BY-SA 4.0),
the benchmark corpora and queries under `bench/data/` (gitignored).
