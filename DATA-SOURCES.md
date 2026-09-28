# Data shipped in the package, and where it comes from

Rule (CLAUDE.md): ship only MIT/BSD/Apache data; CC BY-SA, ODbL and GPL data is for
evaluation only. This file lists every piece of data that ends up in the bundles.

| data | file | source | licence |
|---|---|---|---|
| Snowball Persian stemmer (generated code) | `vendor/snowball/` | snowballstem/snowball v3.1.1 | BSD-3-Clause (`vendor/snowball/COPYING`) |
| Present → past verb stems (356 pairs) | `src/lexicon/data.ts` `VERBS` | Hazm `verbs.dat`, rev `a399c829`; pairs with < 20 uses of all their forms dropped | MIT |
| Broken plurals (103 pairs) | `src/lexicon/data.ts` `PLURALS` | written by hand for this project (`scripts/build-lexicon.ts`), kept when the plural is attested | project's own (MIT) |
| Keep list (1,040 words) | `src/lexicon/data.ts` `KEEP` | **selected by rules from word counts** (see below) | see below |
| Lemma list (579 words, 30 edits) | `src/lexicon/lemmas.ts` `LEMMAS` | **labels of words from our own word list by two AI models** (gpt-6-luna, Claude), kept where both agree, plus rules over Hazm's verbs (see below) | see below |
| Protected words (23) | `src/words.ts` `PROTECTED` | Snowball's own ان exceptions (folded) + words selected like the keep list, + 2 by hand | see below |
| Joined-«می» exceptions (46 entries) | `src/words.ts` `MI_EXCEPTIONS` | selected by rules from word counts | see below |
| Keyboard layouts (3 × 48 keys) | `src/rescue/keyboard.ts` `LAYOUTS` | which key types which letter: the ISIRI 9147 standard (table 1) and the layouts the OSes ship (Windows kbdfar/kbdfa KLC dumps, macOS layouts read with `UCKeyTranslate`); full reference with sources in `bench/lib/keyboards.ts`, checked key by key in `test/rescue.test.ts` | facts about the layouts, no copied files (project's own, MIT) |
| Sound-alike letter groups, keyboard rows | `src/rescue/speller.ts` | ordinary facts about Persian spelling and the ISIRI 9147 layout, written by hand | project's own (MIT) |

Query rescue's word list (`fa-search-kit/rescue/build`, the CLI's `--words`) is built
by each site from its own pages at build time and served with the site; the package
ships no word list.

## The word lists selected from counts

`scripts/build-lexicon.ts` reads `bench/data/vocab.tsv`: how often each word form occurs
in the benchmark's raw sources (Persian Wikipedia 2023-11 shard, CC BY-SA; pn-summary
news, card says MIT; Digikala product titles, card says MIT). Only single words and
their counts are used, never text. A word is kept when rules say so: it takes a
plural itself (مهمان‌ها → مهمان is a word, not مه + مان), a negated form is rarer than
its positive, a «می» word's half-space spelling is never attested, and so on. The
output is a list of ordinary dictionary words, not text from the sources.

**Decision (owner, 2026-09-27): these lists ship under MIT as they are.** They hold
only single dictionary words, chosen by rules from how often words occur; no text from
the sources is copied, and single words and the fact of their frequency are generally
not copyrightable. The counts come in part from CC BY-SA text, so if a stricter reading
is ever wanted (e.g. before a large public release), the same rules can run over counts
from an MIT/public-domain corpus instead; the lists would then be rebuilt and the
benchmark rerun. Hazm's `words.dat` was deliberately not used: whether it derives from
Bijankhan (GPL) is unchecked.

## The lemma list (Phase 4b)

`scripts/build-lemma.ts` builds `src/lexicon/lemmas.ts`: for each listed word, the edit
from the word to its lemma's term («نویسندگان» → نویسنده). The words and their labels
come from:

- **the same word counts** as the lists above (`bench/data/vocab.tsv`): which words to
  label, and rules over them;
- **Hazm's verb list** (MIT), conjugated by our own code (`bench/lib/verbs.ts`);
- **labels by two AI models**: OpenAI gpt-6-luna (through the Codex CLI) and Anthropic
  Claude, each given one word at a time from our list, with no text from any source, and
  the prompt in `bench/lemma-llm/prompt.md`. A label is kept only when both models give the
  same answer. Provenance (models, date, prompt and shard hashes):
  `bench/results/lemma-llm-manifest.json`.

OpenAI's and Anthropic's terms assign the outputs to the user. A list of 579 word → lemma
pairs does not compete with either provider's models. The labels were **checked** against
the UD treebanks (CC BY-SA, evaluation only: `bench/results/lemma-labels.md`), but not
copied from them: comparison models trained on UD gold and on Hazm's lemmatizer
(`bench/lemma-hazm.ts`; Hazm's `words.dat` provenance is unchecked) were measured and
never shipped. The label cache (`bench/data/lemma/`) is gitignored. The build regenerates
the same `lemmas.ts` from it, byte for byte.

Evaluation-only data (never bundled): UD Persian-Seraji and PerDT (CC BY-SA 4.0),
the benchmark corpora and queries under `bench/data/` (gitignored), and the demo site
built from them by `demo/build.ts` (`demo/dist/`, gitignored; CC BY-SA, credited on
every page). The adapters (`src/adapters/`) contain no data.
