---
title: "Core and lexicon API"
description: "Look up the public analyzer, normalizer, tokenizer, stemmer, lexicon, and analytics exports."
---

# Core and lexicon API

The root module is `fa-search-kit`. Use [profiles](../profiles.md) for configuration choices; use the low-level functions only when you need to own the pipeline.

```js
import { normalize, tokenize, Stemmer } from "fa-search-kit";
const tokens = tokenize(normalize("کتاب ها"));
console.log(JSON.stringify(tokens)); // => [{"text":"کتاب‌ها","start":0,"end":7}]
console.log(JSON.stringify(new Stemmer({ closedSplit: true }).stem("نامه‌ای"))); // => "نامه"
```

## fa-search-kit

`createAnalyzer(options?: AnalyzerOptions): Analyzer` creates an analyzer. `Analyzer.analyze(text: string, options?: { mode?: Mode }): string[]` returns terms; mode defaults to index. `Analyzer.tokens(text: string): Token[]` returns unstemmed normalized tokens with source spans. `Mode` is `"index" | "query"`; `Profile` is `"light" | "standard" | "full"`.

`AnalyzerOptions` extends `NormalizeOptions` and `StemOptions`. Its additional fields are `profile`, `rejoin`, `zwnj: "keep" | "both"`, `spellings`, `alefMadda`, and `verbs: "lemma" | "stem"`. Defaults and interactions are described in [profiles](../profiles.md). In an analyzer, `verbs` controls verb lemma lookup; the inherited low-level `verbLemmas` value is overwritten.

`normalize(text: string, options?: NormalizeOptions): Normalized` returns `{ text: string, map: Uint32Array }`. `NormalizeOptions` has `hamzaYeh?: boolean`, false unless enabled. Each output character is intended to map to an original start/end pair at `map[2*k]` and `map[2*k+1]`. The [supplementary-character defect](../recipes.md) limits this mapping today.

`tokenize(normalized: Normalized, rejoin = true): Token[]` accepts the result of normalization. `Token` has `{ text: string, start: number, end: number }`. If supplied a manually built object with an empty map, offsets refer to normalized text instead. Prefer `analyzer.tokens(original)` for display work.

`new Stemmer(options?: StemOptions)` exposes `stem(token: string): string`. Input must already be normalized and tokenized; this class does not perform either step. It caches terms per instance. Its defaults differ from `createAnalyzer()`: no clitic object, no closed-suffix fix or derivational-preservation option is enabled automatically, and no joined-می rule is selected.

### StemOptions and CliticOptions

- `joinedMi?: "zwnj" | "rule" | "lexicon"`: the wrapper implements the joined-prefix insertion only for `rule`. The `lexicon` value currently adds no dedicated guarded-stemming branch; normal lexicon verb lookup is independent of it. Do not rely on the stronger promise in the source comment.
- `negation?: "keep" | "merge"`: controls lexicon negative forms and the explicit نمی rule; it is not universal polarity detection.
- `closedSplit?: boolean`: stems the host before recognized closed suffixes after ZWNJ.
- `derivational?: "strip" | "keep"`: keeps selected derivational endings removed by Snowball when set to keep.
- `lexicon?: Lexicon` and `verbLemmas?: boolean`: optional word lookup and verb lookup; direct Stemmer verb lookup is enabled unless false.
- `clitics?: CliticOptions`: `zwnj?: boolean`, `plural?: boolean`, `joinedMin?: number`, `singleMin?: number`. A zero minimum disables that joined rule. The single-letter rule handles ش and م, not every possible possessive ending.

The root exports the types `Analyzer`, `AnalyzerOptions`, `Mode`, `Profile`, `Normalized`, `NormalizeOptions`, `Token`, `CliticOptions`, `Lexicon`, and `StemOptions` in addition to the four runtime exports above.

## fa-search-kit/lexicon

`lexicon: Lexicon` is the bundled data instance. `Lexicon` is exported as a type from the root and contains `terms: Map<string, string>` and `verb(word: string, keepNegation: boolean): string | undefined`.

`createLexicon(verbs: string, keep: string, plurals: string, lemmas = ""): Lexicon` builds the same shape. Inputs are space-separated `past#present` pairs, keep words, and `plural>singular` pairs. The optional lemma string is the compact generated edit format: a semicolon-separated header of `verb/prefix/cut/append` labels followed by newline-separated `labelIndex:word,word` entries. It is not a general dictionary-file parser and does not validate malformed data.

Use normalized, ZWNJ-free keys for custom data and test collisions. The bundled terms map overrides `get` to consult lemma edits; `has`, iteration, and `size` do not enumerate that secondary list. Avoid mutating the shared singleton after analyzers have cached results; construct a new lexicon/analyzer instead.

## fa-search-kit/analytics

```js
import { createAnalyzer } from "fa-search-kit";
import { canonicalKey, KEY_VERSION } from "fa-search-kit/analytics";
const analyzer = createAnalyzer();
console.log(JSON.stringify(KEY_VERSION)); // => "1"
console.log(JSON.stringify(canonicalKey("كتاب کتابها", { analyzer, prefix: "site-v1" }))); // => "site-v1:کتاب"
```

`canonicalKey(query, { analyzer?, prefix? } = {}): string` deduplicates and sorts query-mode terms and joins them after a version prefix. It defaults to the standard analyzer and exported `KEY_VERSION`, currently `"1"`. It groups equal term sets, not semantic meanings; ordering and repeats disappear. It is not an anonymization function. Use the actual searched query (`result.query` for rescue), your site's analyzer, and a new prefix when configuration changes.

## fa-search-kit/package.json

This public metadata export exposes the package's declared version and export map. It is metadata, not an analyzer entry. JSON import syntax depends on the runtime or bundler.
