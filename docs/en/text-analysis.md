---
title: "Normalize, tokenize, and highlight"
description: "Follow text through the analyzer while preserving the original content for display."
---

# Normalize, tokenize, and highlight

Use `analyze()` for search terms and `tokens()` for normalized tokens with source spans. Do not calculate highlights by looking for stem strings inside the original text.

```js
import { normalize, createAnalyzer } from "fa-search-kit";
console.log(JSON.stringify(normalize("كتاب ۳۰ ٣٠ iPhone").text)); // => "کتاب 30 30 iphone"
console.log(JSON.stringify(normalize("آب رئیس").text)); // => "آب رئیس"
console.log(JSON.stringify(normalize("آب رئیس", { hamzaYeh: true }).text)); // => "آب رییس"
const original = "كتاب‌هاي جديد، مي روم";
const tokens = createAnalyzer().tokens(original);
console.log(JSON.stringify(tokens.map(t => [t.text, original.slice(t.start, t.end)]))); // => [["کتاب‌های","كتاب‌هاي"],["جدید","جديد"],["می‌روم","مي روم"]]
```

## What normalization changes

Arabic yeh and alef maqsura become Persian ی; Arabic kaf and keheh variants become ک. Several heh forms become ه. Alef with hamza/wasla becomes ا, and waw with hamza becomes و. Both Persian and Arabic-Indic digits become ASCII digits. Common Latin uppercase letters become lowercase.

Arabic presentation forms are expanded with per-character NFKC. The function removes Arabic vowel marks, tatweel, ZWJ, selected bidi controls, and BOM. Runs of three or more identical Arabic-script letters collapse to one; two repeated letters stay. This can erase deliberate spelling distinctions.

Half-space (ZWNJ) runs collapse to one between letters and are dropped at word edges. Zero-width space and `¬` between letters are treated as half-spaces; outside letters, `¬` remains. Ordinary spaces and punctuation are not globally collapsed or removed from normalized text.

Standalone `normalize()` keeps ئ unless `hamzaYeh: true` is supplied. `createAnalyzer()` defaults that option to true. Normalization preserves آ; the analyzer can add a separate madda-less index term with `alefMadda`.

## Tokens and joining

Tokens contain Unicode letters, numbers, combining marks, and internal ZWNJ. Punctuation separates tokens. With `rejoin: true`, known spaced prefixes and suffixes are joined: «می روم» and «کتاب ها». Some endings join only after a vowel letter, so «نامه ای» joins while «ای خدا» remains separate. Joining does not cross punctuation or line breaks and does not repair arbitrary word segmentation.

`tokens()` returns normalized, unstemmed text. `analyze()` applies the chosen profile and removes ZWNJ from its final terms. It may emit repeated terms and index-only alternatives; see [indexing](indexing.md).

## Highlight original text

`Token.start` and `Token.end` are intended as UTF-16 offsets into the input, with an exclusive end. Slice the original text, not normalized text. Joined tokens include the original spaces in their span. Presentation-form expansion can give several tokens the same source span; merge overlapping ranges in a custom renderer.

The Pagefind helper creates an escaped HTML excerpt with mark elements:

```js
import { faPagefind } from "fa-search-kit/pagefind";
console.log(JSON.stringify(faPagefind().excerpt("كتاب‌هاي قديمي", "کتاب"))); // => "<mark>كتاب‌هاي</mark> قديمي"
```

Only insert this helper's output through an appropriate trusted rendering path; render user query notices with text nodes. The helper uses prefix matches against token surface forms and index terms, so it is not an exact reproduction of every engine's ranking or match semantics.

### Known offset defect

Current offset mapping counts supplementary Unicode characters, such as emoji, differently from JavaScript regex offsets. For `"😀 کتاب"`, `tokens()` currently reports the Persian token's `start` as `4` and `end` as `undefined`, instead of `3` and `7`. Token text and analyzed terms still work in this reproduction, but original-text highlighting is unreliable. See the [reproduction and fallback](recipes.md). Do not promise general Unicode-safe highlighting until this is fixed.
