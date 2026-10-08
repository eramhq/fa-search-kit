---
title: "Data, licenses, and benchmark limits"
description: "Understand shipped data provenance, evaluation-only material, and what benchmark results can establish."
---

# Data, licenses, and benchmark limits

Use the library as Persian text-processing tooling with finite rules and data. Evaluate it on your own content, especially names, technical vocabulary, negative statements, and mixed-script strings. Better known-item retrieval does not establish universal linguistic correctness.

## Code and shipped data

The project code is MIT. The package includes the generated Snowball Persian stemmer from v3.1.1 under BSD-3-Clause, with its license notice. Hazm verb pairs derive from `verbs.dat` revision `a399c829` under MIT. The project adds hand-written broken plurals, protected/keep words, joined-می exceptions, keyboard facts, and lemma edits.

The source inventory records 354 verb pairs, 107 broken-plural pairs, 1,047 keep words, 579 lemma-list words represented with 30 edits, 23 protected words, and 46 joined-می exceptions. These are inventory counts, not coverage or accuracy measurements.

Keep/protected/exception lists were selected by rules over single-word counts, partly from CC BY-SA Wikipedia text and partly from news/product datasets whose cards state MIT. The inventory records the owner's 2026-09-27 decision to ship those ordinary-word lists under MIT because no source passages are copied. This is a recorded provenance decision, not a blanket conclusion about all derived datasets. A stricter release review can rebuild them from an appropriately licensed corpus and rerun evaluation.

The lemma labels came from agreement between two AI models on words from the project's own list, plus rules over Hazm verbs. A static edit list is shipped; there is no model, inference call, or AI search at runtime. Agreement does not guarantee correct linguistic labels. The inventory records the prompt, models, and shard hashes in the lemma manifest. Hazm `words.dat` and models trained on evaluation labels were not shipped.

## Evaluation and demo are separate

UD Persian-Seraji and PerDT treebanks (CC BY-SA), benchmark text and queries, and the built demo are evaluation material, not bundled search data. `bench/data/` and `demo/dist/` are ignored and must not enter the package. The demo quotes Wikipedia and product titles, includes attribution, and is identified as CC BY-SA. Building the demo requires benchmark data; it is not required to run the library or these documentation examples.

Rescue vocabulary is generated from each site's content. Serve only content that is appropriate for that site's public search and preserve the relevant source obligations; the package's MIT license does not relicense your pages.

## Interpret the benchmark responsibly

The repository's benchmark samples Wikipedia, news, and product corpora, with known-item queries built from title words and controlled spelling/inflection variants. Later reports use a document-based dev/test split. Dev results guide choices; test reports evaluate held-out targets. Recall@10 asks whether the designated document appears among the first ten; MRR rewards an earlier rank. Neither measures the relevance of every returned document.

Read per-corpus and per-variant rows, sample sizes, uncertainty intervals, engine versions, and exact configuration. OR engines can still find a document through unchanged words, hiding damage in the changed word; MRR and shorter queries help expose that. Stemming can merge unrelated words or positive/negative forms. Known-item retrieval alone cannot prove precision or user satisfaction.

Rescue reports distinguish results shown automatically from results reachable after accepting a suggestion, and include false-correction guard sets. These are different outcomes. First-letter partitioning and vocabulary coverage limit spelling rescue. The initial baseline used a different query set and is not directly comparable cell by cell to later phases.

No speed, bundle-size, or accuracy guarantee is made here. Laptop timings, compression settings, engine configuration, browser/network behavior, and corpus size all matter. Measure your actual bundle and representative queries. The full benchmark was not rerun for this documentation-only change.

## Audit trail

Repository-relative source references are retained for source review: [data inventory](../../DATA-SOURCES.md), [MIT license](../../LICENSE), [benchmark methodology](../../bench/README.md), [test-split rescue report](../../bench/results/rescue-test.md), and [Snowball attribution](../../vendor/snowball/README.md). The website importer may render repository files outside its public page navigation as code links; the substantive provenance and limitations are included above so this page stands on its own.
