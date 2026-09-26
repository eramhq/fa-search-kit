# Research notes

Everything found during the planning session (2026-09-26), with sources, so it
does not have to be looked up again. Read with [PLAN.md](PLAN.md).

**How much to trust each line.** Each claim is tagged:
- **[verified]**: read in the primary source (code, docs, repo, API) during the session.
- **[summary]**: from a search-engine summary or a secondary source; the page was not opened or could not be.
- **[estimate]**: our own guess, not measured.

Per the project principle, none of this is a fact until the benchmark agrees.
Explanations from maintainers ("X can't be done because Y") are hypotheses.

---

## 1. Snowball already has a Persian stemmer

- **Added in Snowball 3.1.0 (tagged 2026-05-22)**, v3.1.1 on 2026-06-03. NEWS: "Add Persian (Farsi) stemmer from Saeid Darvish (#181)". [verified]
  - https://raw.githubusercontent.com/snowballstem/snowball/master/NEWS
  - https://snowballstem.org/ ("Apr 2026 – Persian stemming algorithm contributed by Saeid Darvish")
  - https://github.com/snowballstem/snowball/tags
  - PR #194: opened 2024-02-21, merged 2026-04-19 (about two years of review). https://github.com/snowballstem/snowball/pull/194
  - Source: https://github.com/snowballstem/snowball/blob/v3.1.0/algorithms/persian.sbl
  - Description page: https://snowballstem.org/algorithms/persian/stemmer.html
- **Based on** the HPS paper (Rashidi & Zolfy Lighvan, 2014), which reports 95.37% stemming accuracy (not a retrieval measure). https://arxiv.org/abs/1403.2837
- **What it does** [verified, from the .sbl, the description page and the generated JS]:
  - Normalizes Arabic letters: ك→ک, ي→ی, ة→ه, أ/إ→ا, ؤ→و.
  - Removes ZWJ. Keeps ZWNJ only to detect prefixes, then deletes it. So our normalizer must **not** strip ZWNJ before calling it.
  - Prefixes: strips می only when a ZWNJ follows it. Two sources disagree on نمی: the stemming research reported "نمی is kept"; the JS-ecosystem research reported "strips می‌/نمی‌". **Check against the code.** ن and ب are kept; نا-/بی- are kept.
  - Suffixes: plurals (ها، ان with an exception list such as ایران/تهران، ات، ین، یان، گان), ام/اش, تر/ترین, derivational endings (گاه، بان، گی، انه، مند…), verb person endings when a verb cue is present. Has a lexical guard for words ending in ـان.
  - **Does not strip مان/تان/شان**: "without a lexicon we cannot distinguish the two cases" (clash with the ان plural).
  - No present→past verb stem mapping (رو→رفت), no Arabic broken plurals.
- **How the PR was reviewed** (PR #194) [verified]:
  - Maintainers required test data and a written description giving the reason for each rule.
  - They asked for Latin transliterations in comments.
  - They proposed a syllable-based R1 region; the contributor said it doesn't work for Persian because short vowels aren't written. Character-count minimums are used instead.
  - They rejected stripping negation prefixes because it "conflates opposites".
- **Open follow-ups**: #181 (the original Persian request, 2023, closed), #275 (Ada bug caused by the Persian stemmer), #282 (hyphens, open, milestone 3.2.0). https://github.com/snowballstem/snowball/issues?q=persian
- **Generated JS**: https://snowballstem.org/js/persian-stemmer.js [verified]
  - 3.9 KB minified, about **1.3 KB gzipped**, plus `base-stemmer.js` at about 0.8 KB gzipped. For comparison: Arabic 1.9 KB gz, English 1.8 KB gz.
  - The JS generator emits ES modules: `import … from './base-stemmer.js'` then `export default class extends …`; `base-stemmer.js` is `export default class BaseStemmer`. https://raw.githubusercontent.com/snowballstem/snowball/master/compiler/generator_js.c
  - No official Snowball npm package. `snowball-stemmers` 0.6.0 is a 2016 port. `@orama/stemmers` 3.1.18 bundles Snowball output. https://registry.npmjs.org/snowball-stemmers
- **Rust**: already compiled in SeekStorm `snowball-stemmers-rs` (MIT). https://github.com/SeekStorm/snowball-stemmers-rs . `rust-stemmers` is stale (last release 1.2.0, 2019). https://github.com/CurrySoftware/rust-stemmers
- **Snowball test data for Persian**: Persian Wikipedia word list, CC BY-SA 3.0. https://github.com/snowballstem/snowball-data/tree/main/persian
- **Snowball license**: BSD-3 [summary; the license page itself was not opened this session].

### Contributing to Snowball
From https://github.com/snowballstem/snowball/blob/master/CONTRIBUTING.rst [verified]:
- Coordinated PRs to three repos:
  - `snowball`: the `.sbl` file plus `modules.txt`. No literal non-ASCII characters in the source (use `stringdef`).
  - `snowball-data`: `voc.txt`, `output.txt`, `COPYING`. The word list must be under an OSI-approved license; there's a Wikipedia word-frequency script if you have none.
  - `snowball-website`: a description explaining **why** each rule exists.
- How Esperanto/Estonian/Polish were accepted: not researched (Estonian was PR #108).

### Snowball Arabic stemmer (for shared-script lessons)
Chelli & Aries, 2016. Removes diacritics and tatweel, converts Arabic-Indic digits, folds presentation forms and lam-alef, normalizes hamza after stemming, uses noun/verb flags. Says nothing about Persian. https://snowballstem.org/algorithms/arabic/stemmer.html [verified]

---

## 2. Other Persian stemmers and lemmatizers

| Tool | What it does | License | Source |
|---|---|---|---|
| **Lucene PersianStemmer** | Strips 8 suffixes: ات، ان، ترین، تر، یی، ی، ها, trailing ZWNJ. No prefixes, no verbs, no clitics (کتابم/کتابش stay). Keeps ≥2 chars. Merges ماهی→ماه. Added May 2022; on by default in Lucene 10's `persian` analyzer. [verified] | Apache-2.0 | https://github.com/apache/lucene/blob/main/lucene/analysis/common/src/java/org/apache/lucene/analysis/fa/PersianStemmer.java |
| **Lucene PersianNormalizer** | Maps to the *Arabic* ي/ك (the opposite direction from us), folds ۀ→ه, removes hamza-above. Older PersianAnalyzer (PersianCharFilter) splits on ZWNJ as well as whitespace. [verified / summary] | Apache-2.0 | https://github.com/apache/lucene/blob/main/lucene/analysis/common/src/java/org/apache/lucene/analysis/fa/PersianNormalizer.java |
| **Hazm** | Lemmatizer maps present→past: `می‌روم` → `رفت#رو` (past#present); `کتاب‌ها` → `کتاب`. Nouns: lexicon first, then Stemmer fallback. Verb and word lists usable for our lexicon. [verified] | MIT | https://github.com/roshan-research/hazm/blob/master/hazm/lemmatizer.py |
| **Parsivar** | `FindStems`: `بیابیم` → `یافت` (present→past). Algorithm undocumented. | MIT | https://github.com/ICTRC/Parsivar |
| **DadmaTools** | Lemmatizer outputs `داد#ده`; reports 99.14% F1 on PerDT. V2 in 2025. Model/data licenses not stated. | Apache-2.0 (code) | https://github.com/Dadmatech/DadmaTools |
| **Perstem** | Prefixes, suffixes, clitics, irregular present stems (kon→kar). | **GPL-3.0** (don't copy code) | https://github.com/jonsafari/perstem |
| **Stanza fa** | 98.97% lemma accuracy on PerDT (as reported in the DadmaTools paper). License not checked. | ? | https://aclanthology.org/2022.naacl-demo.13.pdf |
| **ParsiPy** (2025) | Historical Persian; not relevant. | | https://arxiv.org/pdf/2503.17810 |

No other new general-purpose Persian stemmers (2023–2026) were found.

---

## 3. Does stemming help Persian retrieval?

- **Dolamic & Savoy 2009** (CLEF Hamshahri; Okapi, DFR, LM, tf-idf): light stemmer beat no stemming by about **+4.5% MAP** and 4-gram indexing by about **+4.7%**; also beat a plural-only stemmer; DFR was the best model. News text, 2009-era queries. https://webis.de/events/tir-09/tir09-papers-final/dolamic09-persian-language-is-stemming-efficient.pdf [verified]
- **Perstem at CLEF 2009**: a search snippet claims +91% precision and +43% recall. **Not confirmed**; the abstract wouldn't open. https://link.springer.com/chapter/10.1007/978-3-642-15754-7_11 [summary]
- **AleAhmad et al.**: 4-gram Lnu.ltu worked acceptably; local context analysis did best. https://www.researchgate.net/publication/4343753_N-gram_and_Local_Context_Analysis_for_Persian_text_retrieval [summary]
- **No study found comparing lemmatizers vs stemmers on retrieval.** Our benchmark would be the first.
- **No published numbers on how browser/JS search engines do on Persian.** That's the research gap this project fills.

---

## 4. Browser and JS search engines

### Pagefind
- Latest **v1.5.2 (2026-04-12)**. v1.5.0 (2026-04-06) added diacritic-insensitive matching (`exactDiacritics`), Intl.Segmenter for CJK queries, and a Snowball upgrade. v1.2.0 added Persian UI translations. https://github.com/Pagefind/pagefind/releases , https://github.com/Pagefind/pagefind/blob/main/CHANGELOG.md [verified]
- Stemming comes from its own crate **`pagefind_stem` 1.0.0** (2026-03-23), "Snowball stemming algorithms repackaged for Rust". PR #1036 moved it from Snowball 2.2.0 to 3.0.x. **No Persian**, since Persian arrived in 3.1.0. https://lib.rs/crates/pagefind_stem , https://github.com/Pagefind/pagefind/pull/1036 , https://raw.githubusercontent.com/Pagefind/pagefind/main/pagefind/Cargo.toml [verified]
- Docs list Persian (`fa`) with UI ✅, stemming ❌. Stemming ✅ for Arabic, Basque, Catalan, Danish, Dutch, English, Finnish, French, German, Greek, Hindi, Hungarian, Indonesian, Italian, Norwegian, Polish, Portuguese, Romanian, Russian, Serbian, Spanish, Swedish, Tamil, Turkish. https://pagefind.app/docs/multilingual/ , https://raw.githubusercontent.com/Pagefind/pagefind/main/docs/content/docs/multilingual.md [verified]
- **Normalization** in `fossick/splitting.rs` [verified by reading; the ZWNJ behaviour is inferred]:
  - Splits only on ASCII punctuation and whitespace.
  - Runs NFD and drops combining marks, so Arabic harakat get stripped.
  - No explicit ZWNJ (U+200C) or tatweel handling; no ي→ی or ك→ک. ZWNJ probably stays inside the token (**inference, test it**).
  - https://raw.githubusercontent.com/Pagefind/pagefind/main/pagefind/src/fossick/splitting.rs
- **Hidden elements are indexed.** `parser.rs` only drops head, style, script, noscript, label, form, svg, footer, nav, iframe, template. It doesn't check `hidden`, `aria-hidden` or CSS. https://raw.githubusercontent.com/Pagefind/pagefind/main/pagefind/src/fossick/parser.rs [verified]
- **Extension points** [verified]:
  - Pagefind UI `processTerm`: pre-search hook for normalizing the query. https://raw.githubusercontent.com/Pagefind/pagefind/main/docs/content/docs/ui.md
  - Node API: `addCustomRecord({url, content, language, meta, filters, sort})` (url/content/language required; content is plain text Pagefind "lightly processes"), and `addHTMLFile`. https://raw.githubusercontent.com/Pagefind/pagefind/main/docs/content/docs/node-api.md , https://pagefind.app/docs/node-api/
  - `data-pagefind-weight`: 0–10, quadratic scale. https://raw.githubusercontent.com/Pagefind/pagefind/main/docs/content/docs/weighting.md
  - `data-pagefind-index-attrs`: comma-separated attributes to index. https://raw.githubusercontent.com/Pagefind/pagefind/main/docs/content/docs/indexing.md
  - The JS search API (`pagefind.search`, `debouncedSearch`) has no documented query-transform hook besides UI `processTerm`. https://pagefind.app/docs/api/
- **Upstream template**: PR #1032 added Polish (merged 2026-03-23): generated `pagefind_stem/src/snowball/algorithms/polish.rs` with the Snowball compiler, added a feature flag, enum entry, `get_stemmer` arm, and tests. https://github.com/Pagefind/pagefind/pull/1032 . CONTRIBUTING has no language-specific guidance. https://github.com/Pagefind/pagefind/blob/main/CONTRIBUTING.md [verified]
- Related issues: #734 (RTL/Persian UI, closed), #1191 (RTL CSS logical properties, open), Persian translation PRs #1204, #690, #385. **No issue about Persian stemming or ZWNJ.** https://github.com/Pagefind/pagefind/issues/734 , https://github.com/Pagefind/pagefind/issues/1191
- npm `pagefind` version 1.5.2 (checked with `npm view`).

### Orama
- Stemmers in `packages/stemmers/lib` are Snowball-generated (ar, ne, …); **no fa**. https://github.com/oramasearch/orama/tree/main/packages/stemmers/lib [verified]
- Tokenizer accepts `stemmer`, `stopWords`, `stemmerSkipProperties`. https://raw.githubusercontent.com/oramasearch/orama/main/packages/orama/src/components/tokenizer/index.ts [verified]
- **Bug**: the Arabic splitter regex is `/[^a-z0-9أ-ي]+/gim`. The range U+0623–U+064A leaves out پ چ ژ ک گ ی (all outside it), so those letters act as **separators**. https://raw.githubusercontent.com/oramasearch/orama/main/packages/orama/src/components/tokenizer/languages.ts [verified the regex; the effect on real Persian text is by reasoning, **test it**]
- Supports `mode: 'vector' | 'hybrid' | 'fulltext'` with `vector[N]` schema fields; `@orama/plugin-embeddings` uses TensorFlow.js. https://github.com/oramasearch/orama

### MiniSearch, FlexSearch, Lunr, Fuse.js
- **MiniSearch 7.2**: `tokenize(text, field)` and `processTerm(term, field)`, separately overridable under `searchOptions`. Nothing Persian. https://github.com/lucaong/minisearch
- **FlexSearch 0.8.2**: `Encoder` with `addMapper`, `addReplacer`, `addStemmer`, `addFilter`, `normalize`/`prepare`/`finalize`. Language packs only en, de, fr. Arabic charset supported, no Persian/Arabic pack. https://github.com/nextapps-de/flexsearch
- **lunr-languages** (npm 1.22.0): has ar and he, **no fa**. Adding one needs a stemmer, a stop-word file and tests. https://github.com/MihaiValentin/lunr-languages , https://raw.githubusercontent.com/MihaiValentin/lunr-languages/master/CONTRIBUTING.md
- **Fuse.js**: `ignoreDiacritics` and `getFn`, no tokenizer hook. https://github.com/krisk/Fuse/pull/773 . Current version not confirmed (docs URL 404).

---

## 5. Server engines (for comparison, out of scope)

- **Elasticsearch `persian` analyzer**: maps U+200C to a space, then standard tokenizer, lowercase, decimal_digit, arabic_normalization, persian_normalization, persian_stop, persian_stem. Lucene 10 made `persian_stem` default; ES keeps a legacy analyzer for old indices. https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html , https://github.com/elastic/elasticsearch/issues/113050 , https://github.com/elastic/elasticsearch/issues/98911 [verified]. OpenSearch not checked separately.
- Community ES plugins: https://github.com/NarimanN2/ParsiAnalyzer , https://github.com/mlkmhd/persian-analyzer-elasticsearch
- **Meilisearch / charabia**: PR #350 merged 2025-08-12, shipped in charabia v0.9.7. Normalizes Yeh (ي ی ى ۀ → ی) and Kaf (ك→ک), Persian digits → ASCII, alef, tatweel; segments on ZWNJ. ZWNJ bug-fix PR #379 closed unmerged; PR #382 (unify Kaf/Yeh with the Arabic normalizer) open. https://github.com/meilisearch/charabia/pull/350 , https://github.com/meilisearch/charabia/pull/379 , https://github.com/meilisearch/charabia/pull/382 , https://github.com/meilisearch/meilisearch/issues/5847
- **Typesense**: no fa in its locale list (ja, zh, ko, th, el, ru, sr, uk). Uses Snowball for `stem`. Issues #1957, #1288 open. https://typesense.org/docs/30.1/api/collections.html , https://github.com/typesense/typesense/issues/1957
- **Algolia**: fa segmentation N/A, plurals (`ignorePlurals`) "No support", stop words available. https://www.algolia.com/doc/guides/managing-results/optimize-search-results/handling-natural-languages-nlp/in-depth/supported-languages/

---

## 6. Evidence of user pain

**No public engineering write-ups** from Digikala, Torob, Basalam, Snapp, Filimo, Taaghche, Fidibo, Zarebin or Gerdoo on query understanding, variants, Finglish or wrong layout were found. Divar's blog (https://virgool.io/divarengineering) covers maps, images, SSR, not query text. So the evidence is forums, issue trackers and small products.

1. **Arabic vs Persian letters (ي/ی, ك/ک) → zero results.** Most-reported problem on WordPress/WooCommerce (e.g. iPhone Arabic keyboard).
   - https://wp-parsi.com/support/topic/46042 (unresolved), https://wp-parsi.com/support/topic/40573 , http://forum.wp-persian.com/topic/201703 , http://forum.wp-persian.com/topic/390348
   - Site owners pay freelancers to fix it (80,000 Toman project): https://parscoders.com/project/213349
   - OJS: «فارسي» with Arabic ی doesn't match «فارسی». https://github.com/pkp/pkp-lib/issues/13393
   - WP-Parsi has a "convert Arabic letters to Persian" setting [summary].
2. **Half-space (ZWNJ) vs space vs joined.**
   - OJS treats ZWNJ as a space: «می‌شود» → «می» (too short, dropped) + «شود». Diacritics also split words into fragments. https://github.com/pkp/pkp-lib/issues/13393
   - «کتاب‌ها» and «کتابها» indexed as different words [summary].
   - Users type without ZWNJ, e.g. «تگ های هدینگ» (SEO writer, no data). https://virgool.io/@neginskandary/semi-space-q2praes14oc7
   - Hazm's rule list: «شنبهها»→«شنبه‌ها», «میخواهم»→«می‌خواهم» but not «میهن»/«میراث», ZWNJ next to a space, digits glued to letters, repeated letters («سلامممم»). https://virgool.io/product-hazm/ (post id `qyu37ykvu8vq`; full URL was truncated in the session)
   - A Persian RAG paper says users often type a space where ZWNJ belongs [summary, not verified in the paper]. https://arxiv.org/pdf/2101.08087
3. **Wrong keyboard layout (and Finglish).**
   - Triboon's ad panel added both after analysing user behaviour: `nd[d` finds «دیجی», "Alef" finds «الف». https://www.triboon.net/blog/newsroom/بهبود-جستجوی-نام-رسانه-ها-در-پنل-تریبون/
   - Tools: Keyboard-Language-Fix (Windows app + extension) https://github.com/mahmoudiav/Keyboard-Language-Fix ; wrong-keyboard (Python, word-list check) https://github.com/arian42/wrong-keyboard ; Behnevis (Finglish→Persian) https://behnevis.com/
   - No usage numbers for Finglish; anecdotal: https://persianwithel.com/culture/fingilish-persian-romanized/ ; 3,640 code-mixed tweets: https://arxiv.org/pdf/2102.12700
4. **Typos.** No Persian-specific share found. Industry figures:
   - ~25% of site-search queries misspelled (Clerk): https://www.clerk.io/blog/misspelled-searches
   - ~13% of queries contain errors (Walmart): https://arxiv.org/pdf/2408.04884
   - 69% of sites don't autocomplete slightly misspelled terms (Baymard): https://baymard.com/blog/offer-autocomplete-suggestions-for-misspellings
   - Parsijoo query-log study on reformulations (full text blocked): https://www.researchgate.net/publication/327498118
5. **Spelling variants the Academy allows** (dual spellings the index must merge):
   - Preferred «مسئله», «هیئت», but «مسأله», «هیأت» accepted; «مسئول/مسؤول», «رئیس/رییس» both correct; «پائیز» → «پاییز». https://utype.ir/docs/نگارش-فارسی/درست-نویسی/املای-درست-همزه-فارسی/
   - Silent-ه possessive written «هٔ» (vs «ه‌ی» or «ۀ»). https://utype.ir/docs/نگارش-فارسی/درست-نویسی/ه-همزه-دار-یا-ی/
   - Primary source, دستور خط فارسی: https://apll.ir/1401/12/15/دستور-خطّ-فارسی/

### Existing WordPress / JS text tools (don't rebuild)
- **APSearch** (WordPress): normalizes Yeh/Kaf/Alef/Heh families, removes diacritics and Quranic marks, Arabic-Indic digits → standard, strips ZWNJ and invisible marks. Works with WP search, WooCommerce, WP-CLI. **No stemming, Finglish, keyboard layout or autocomplete.** v0.1.0, first release 2026-08-31, fewer than 10 installs. Quote: "WordPress search fails on Arabic-script languages, and it fails silently." https://wordpress.org/plugins/apsearch-arabic-persian-search/ [verified]
- **Relevanssi** stores terms exactly as written: کتاب‌ها ≠ کتابها, كتاب ≠ کتاب, ۱۴۰۳ ≠ 1403 [summary, via APSearch's FAQ]. https://www.relevanssi.com/user-manual/woocommerce/
- WordPress/WooCommerce default search is a plain `LIKE '%term%'` match.
- **Virastar** (MIT, JS): Persian text cleaner; `cleanup_zwnj` removes duplicate/unneeded ZWNJs. https://github.com/brothersincode/virastar
- **persian-tools** (v4.0.4): digits, Arabic-char cleanup, `halfSpace`, slugify, validators. No keyboard-layout fix, search or stemming documented. https://github.com/persian-tools/persian-tools , https://persian-tools.js.org/
- Also: persianize, persianjs, starkstring (npm).
- PrePer, a Persian pre-processor (Seraji): https://www.diva-portal.org/smash/get/diva2:839590/FULLTEXT01.pdf

---

## 7. Keyboard layouts

- **ISIRI 9147** (standard) base layer on US QWERTY [summary, from Wikipedia; verify against kbdlayout.info before shipping]:
  - Top row: q→ض w→ص e→ث r→ق t→ف y→غ u→ع i→ه o→خ p→ح
  - Home row: a→ش s→س d→ی f→ب g→ل h→ا j→ت k→ن l→م
  - Bottom row: z→ظ x→ط c→ز v→ر b→ذ n→د m→پ
  - ZWNJ is Shift+Space. Remaining keys (`[ ] ; ' , \``, shift layer) still to fill in; e.g. Triboon's `nd[d` → «دیجی» implies `[`→ج, and `;ta` → «کفش» implies `;`→ک.
  - https://en.wikipedia.org/wiki/ISIRI_9147 , https://persian-computing.org/wiki/Keyboard
- **Windows**: legacy "Persian" (KBDFA) https://kbdlayout.info/KBDFA/ and "Persian (Standard)" (kbdfar) http://kbdlayout.info/kbdfar/ . The shift-state pages there have everything needed for full tables.
- **macOS** default is based on the older ISIRI 2901; ز ذ د ر پ ئ sit in different places than on Windows standard. https://github.com/sarabbafrani/persian-pc-mac , https://groups.google.com/g/persian-computing/c/riGWQt5lNOY . No full key-by-key comparison obtained yet.
- **Wrong-layout detection elsewhere**:
  - Yandex Browser re-searches in the other layout if the first search fails. https://yandex.com/support/browser/en/search-and-browse/search.html
  - Punto Switcher (Yandex; `ghbdtn` → `привет`) uses dictionaries of "impossible" letter combinations built from millions of words [secondary]. https://grokipedia.com/page/Punto_Switcher , https://github.com/topics/punto-switcher
  - Rekey (open source): per-language n-gram blacklists plus a vowel check. https://github.com/andrewbasarab/rekey
  - No official Yandex algorithm paper found.

---

## 8. Spelling correction and typos

- Commercial: Paknevis (0.78) vs Virastman (0.60) in one comparison. https://www.researchgate.net/figure/Comparison-of-different-Persian-spell-checkers_tbl1_270752606
- Open source: Nevise (BERT-based) https://github.com/Dadmatech/Nevise ; SymSpell + KenLM on Wikipedia https://github.com/pooya-mohammadi/persian-spell-checker-kenlm
- Datasets: **FarsTypo** https://arxiv.org/abs/2305.11731 ; PerSpellData https://aclanthology.org/2021.nsurl-1.2.pdf
- JS SymSpell: only stale packages (symspell-ex 2022, node-symspell 2022). Plan: write our own small delete index.
- Not found: a "Persian SymSpell" product, ParsBERT spell, Hazm spell.

---

## 9. Evaluation data and licenses

**Rule: CC BY-SA / ODbL / GPL data is for evaluation only, never bundled.**

| Dataset | Size / content | License | Source |
|---|---|---|---|
| Hamshahri (CLEF 2008/09) | 166,774 docs, topics 551–650; Hamshahri2 320k+ docs | **not found** (download page didn't respond) | http://dbrg.ut.ac.ir/Hamshahri/download.html |
| UD Persian-Seraji | hand-made lemmas | CC BY-SA 4.0 | https://github.com/UniversalDependencies/UD_Persian-Seraji |
| UD Persian-PerDT | since v2.12 verb lemmas keep only the past stem | CC BY-SA 4.0 | https://github.com/UniversalDependencies/UD_Persian-PerDT/blob/master/README.md |
| PersianStemmingDataset | word/stem/POS: 4,689 (PerTreeBank) + 26,913 (PerDT) | license file exists, terms **not read** | https://github.com/htaghizadeh/PersianStemmingDataset |
| lemmatization-lists | 6,273 Persian pairs | ODbL | https://github.com/michmech/lemmatization-lists |
| Bijankhan (normalized) | ~2.6M tagged words | GPL-3.0 | https://github.com/tihu-nlp/normalized_bijankhan |
| PerLex | lexicon, "freely available" | exact license not found | https://aclanthology.org/L10-1486/ |
| FaMTEB | 63 datasets incl. retrieval | per-dataset | https://arxiv.org/abs/2502.11571 |
| msmarco-fa | 8.84M passages (translated) | none on card | https://huggingface.co/datasets/MCINext/msmarco-fa |
| Shiraz | 6.25M rows, LLM-made search queries | not checked | https://huggingface.co/datasets/shekar-ai/Shiraz |
| Digikala (Kaggle) | product + comment dumps; **no query/relevance data** | not checked | https://www.kaggle.com/datasets/radeai/digikala-comments-and-products |
| digikala-mobile-expert-data (HF) | product data for RAG | not checked | https://huggingface.co/datasets/NavHash/digikala-mobile-expert-data |
| Persian Wikipedia | corpus | CC BY-SA | dumps.wikimedia.org |

- mMARCO itself has no Persian.
- No real Digikala or Torob query logs are public.
- "Flexicon": not found.
- A Persian fashion-catalog hybrid search project (ES BM25 + multilingual embeddings) exists as a reference: https://github.com/mahsamb/persian-products-elasticsearch-kaggle

---

## 10. Semantic search in the browser

Sizes from the Hugging Face API, 2026-09-26 [verified]:

| Model | Size | Notes | Source |
|---|---|---|---|
| multilingual-e5-small | 118 MB int8 | | https://huggingface.co/Xenova/multilingual-e5-small |
| paraphrase-multilingual-MiniLM-L12-v2 | 118 MB int8 | | https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2 |
| EmbeddingGemma-300m | ~175 MB q4f16 | | https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX |
| jina-embeddings-v3 | 1.1 GB fp16 | CC-BY-NC | https://huggingface.co/jinaai/jina-embeddings-v3 |
| Tooka-SBERT-V2-Small (PartAI) | 123M params, 492 MB safetensors, no ONNX | PTEB avg 70.62 vs jina-v3 70.24, mE5-base 70.09 | https://huggingface.co/PartAI/Tooka-SBERT-V2-Small |
| Tooka-SBERT-V2-Large | | | https://huggingface.co/PartAI/Tooka-SBERT-V2-Large , https://aclanthology.org/2025.findings-ijcnlp.147/ |
| Model2Vec potion-multilingual-128M | 512 MB fp32, 256 dims, lists fa | | https://huggingface.co/minishlab/potion-multilingual-128M |
| Model2Vec potion-base-8M | 30 MB | English only | |

- **None of the transformer models fit under 30 MB.**
- Model2Vec distillation supports a custom `vocabulary`, `pca_dims`, `quantize_to`, `vocabulary_quantization`. https://raw.githubusercontent.com/MinishLab/model2vec/main/model2vec/distill/distillation.py . A Persian-vocabulary int8 distill landing at a few MB to 30 MB is an **[estimate]**. No official JS package, no Persian quality numbers.
- transformers.js v4.3.0: https://www.npmjs.com/package/@huggingface/transformers
- FaMTEB: jina-v3 best overall; Persian models lead on classification and pair tasks. https://arxiv.org/abs/2502.11571
- Other Persian embedding work: Hakim https://arxiv.org/html/2505.08435 ; Persian RAG (MatinaSRoberta, chunk sizes) https://arxiv.org/abs/2501.04858
- Browser hybrid search: Orama `hybrid` mode.
- SPLADE for Persian in the browser: not found (not searched in depth).

---

## 11. Inspiration from other languages

- **Russian, Punto Switcher / Yandex**: wrong-layout fixing is expected everywhere (`ghbdtn` → `привет`). Same problem in Persian (`;ta` → `کفش`). See §7.
- **Chinese, pinyin search**: shops let users type Latin pinyin. pinyin-pro `match`: https://pinyin-pro.cn/en/use/match.html ; pinyinlite: https://github.com/breezewish/pinyinlite
- **India, Flipkart Hinglish**: transliteration and phonetic spelling for mixed Hindi-English queries (`doble badsheet` → `double bed sheet`); mixed script is the norm, not an edge case. https://blog.flipkart.tech/adapting-search-to-indian-phonetics-cdbe65259686 ; SIGIR eCom '22 code-mix query translation: https://sigir-ecom.github.io/ecom22Papers/paper_293.pdf
- **Japanese, TinySegmenter**: a ~25 KB learned model in the browser, a precedent for a tiny model where rules aren't enough [size is from memory, not checked].
- **tinySarf** (the project that started this): Arabic morphology in the browser via WebGPU; two CNNs, 245,063 params, 239,894 bytes Brotli; trained on CamelMorph MSA (CC BY 4.0); 87.02% segmentation / 78.24% root agreement **with its teacher** on 1,094 words, no gold evaluation. https://github.com/AhmedAbdel-Aal/tinySarf . Lesson: grade against human-checked data from day one.

---

## 12. Persian morphology cases to test

- Clitics م ت ش مان تان شان vs words that end in those letters (آتش, مردم = people vs mard-am).
- Plurals ها / ان / ات / ین, and ان-final words (ایران, زمان, تهران).
- Arabic broken plurals (کتب/کتاب) — no documented search best practice found.
- Verb prefixes می / نمی / ب / ن; present vs past stems (رو/رفت, کن/کرد).
- Comparative/superlative تر / ترین.
- ZWNJ vs space vs joined (می‌روم / می روم / میروم; کتاب‌ها / کتاب ها / کتابها).
- Ezafe ی and ۀ / هٔ / ه‌ی — no documented search best practice found.
- Over-stemming pairs: ماهی (fish) ≠ ماه (moon/month).
- Short words: short vowels aren't written, so use character-count minimums (Snowball's conclusion — still a hypothesis to test).
