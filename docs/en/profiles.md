---
title: "Choose profiles and verb handling"
description: "Choose normalization, stemming, lexicon, and verb options to fit your search behavior."
---

# Choose profiles and verb handling

Start with `standard` for rule-based analysis without a lexicon import. Use `full` when you need the bundled keep list, known broken plurals, and additional word or verb mappings.

```js
import { createAnalyzer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";
const light = createAnalyzer({ profile: "light" });
const standard = createAnalyzer();
const full = createAnalyzer({ profile: "full", lexicon, verbs: "lemma" });
const stem = createAnalyzer({ profile: "full", lexicon, verbs: "stem" });
console.log(JSON.stringify(light.analyze("کتاب‌ها", { mode: "query" }))); // => ["کتابها"]
console.log(JSON.stringify(standard.analyze("کتاب‌ها", { mode: "query" }))); // => ["کتاب"]
console.log(JSON.stringify(full.analyze("می‌شود شد نمی‌کند", { mode: "query" }))); // => ["شد","شد","نکرد"]
console.log(JSON.stringify(stem.analyze("می‌شود شد نمی‌کند", { mode: "query" }))); // => ["شود","شد","نمیکن"]
console.log(JSON.stringify(full.analyze("کتب", { mode: "query" }))); // => ["کتاب"]
```

## What each profile enables

`light` normalizes and tokenizes, rejoins recognized spaced affixes, and removes ZWNJ from final terms. It does not stem or use a lexicon. By default it still adds madda-less terms and half-space segments in index mode; it is not just `normalize()`.

`standard` adds Snowball Persian stemming and wrapper rules: handling closed suffixes after ZWNJ, guarded joined می, some possessive clitics, and preservation of derivational suffixes. It needs no lexicon.

`full` requires an explicitly imported `lexicon`; otherwise construction throws. It adds keep words, known broken plurals, lemma edits, recognized verbs, and more aggressive joined-clitic stripping. The lexicon is finite and analysis has no sentence context. Passing `lexicon` directly to `createAnalyzer()` does not select full: set `profile: "full"`. Adapters do infer full from a supplied lexicon unless you explicitly choose another profile.

## Lemma versus stem

With full and `verbs: "lemma"`, recognized conjugations map to a past-stem term, such as «می‌شود» and «شد» both yielding «شد». This broadens cross-tense matching but can reduce ranking distinctions. It is not a grammatical lemma extractor for arbitrary text.

With `verbs: "stem"`, verb lemma lookup is disabled, while other full-profile word lists and clitic rules remain active. Outputs are search stems and need not be dictionary words. Negation defaults to `keep`; `merge` can conflate positive and negative forms and should be evaluated for your content.

Direct `createAnalyzer()` defaults to lemma behavior when full is selected. Adapters default to lemma for Pagefind, FlexSearch, and MiniSearch configured with AND; to stem for Orama, Lunr, and MiniSearch with OR. Supplying your own `analyzer` bypasses these adapter defaults.

## Options and tradeoffs

`rejoin: true`, `zwnj: "both"`, `alefMadda: true`, and `hamzaYeh: true` are analyzer defaults. `spellings` defaults to true for standard/full and false for light. `zwnj: "keep"` suppresses index-only compound parts; it does not retain ZWNJ in final terms. Disabling alternatives narrows matches and can reduce false matches.

Analyzer stem defaults are `closedSplit: true`, `joinedMi: "rule"`, `negation: "keep"`, and `derivational: "keep"`. Standard trusts clitics after ZWNJ or plural suffixes; full also sets `joinedMin: 3` and `singleMin: 3`. A supplied `clitics` object replaces this object rather than merging its fields.

Use [the core reference](api/core.md) for lower-level options and the current `joinedMi: "lexicon"` caveat. Rebuild your index when any term-producing setting or lexicon changes.
