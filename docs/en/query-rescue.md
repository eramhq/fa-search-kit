---
title: "Offer optional query correction"
description: "Build site vocabulary and distinguish automatic corrections from suggestions."
---

# Offer optional query correction

Rescue is an opt-in layer above normal analysis. It tries keyboard-layout candidates, then nearby Persian spellings drawn from your own content. It is not a general spellchecker or a guarantee of the user's intent.

## Collect words alongside indexing

This runnable example uses MiniSearch's default OR behavior and the same analyzer for indexing, querying, and rescue.

```js
import MiniSearch from "minisearch";
import { createAnalyzer } from "fa-search-kit";
import { faMiniSearch } from "fa-search-kit/minisearch";
import { createRescue } from "fa-search-kit/rescue";
const analyzer = createAnalyzer();
const index = new MiniSearch({ fields: ["title"], ...faMiniSearch({ analyzer }) });
const rescue = createRescue({ analyzer });
for (const doc of [
  { id: "shop", title: "دیجی کالا" },
  { id: "soap", title: "صابون طبیعی" },
]) {
  index.add(doc);
  rescue.addText(doc.title);
}
for (const input of ["nd[d", "سابون", "سابون طبیعی"]) {
  const result = await rescue.rescueSearch(q => index.search(q), input);
  console.log(JSON.stringify([result.query, result.fix?.to, result.fix?.auto]));
}
// => ["دیجی","دیجی",true]
// => ["صابون","صابون",true]
// => ["سابون طبیعی","صابون طبیعی",false]
```

`nd[d` finds «دیجی» through a keyboard conversion. «سابون» finds nothing as typed, so «صابون» is searched automatically. «سابون طبیعی» already finds the soap document through «طبیعی», so results stay as typed and «صابون طبیعی» is only a suggestion. These outcomes depend on this exact vocabulary and engine configuration.

`addText` collects analyzed index terms for known-word checks and normalized surface words for spelling candidates. Call it for the actual searchable content. No site vocabulary ships with the package.

## Corrections are decisions to expose

A search is considered weak when it finds nothing or a query word is unknown. Keyboard-only fixes can be automatic even if the typed query found results. Spelling fixes are automatic when the typed query found nothing; otherwise they are suggestions. A mixed keyboard/spelling fix with existing results is a suggestion.

`rescueSearch` searches the original query first and returns `{ results, query, fix? }`. It keeps a fix only after the corrected query returns results. `check(query, found)` alone does not perform that final result check; callers must do it.

When `fix.auto` is true, state that results are for `fix.to` and offer “search as typed.” That action must call your plain engine search with `fix.from`, bypassing rescue, or the same correction may repeat. When false, keep the typed results and let the visitor choose the suggestion. Render query text with text nodes, not interpolated HTML. For asynchronous UIs, discard responses for superseded input.

## Build and load vocabulary

```js
import { createWordList } from "fa-search-kit/rescue/build";
const words = createWordList();
words.add("صابون طبیعی دیجی کالا");
console.log(JSON.stringify(words.files().has("index.json"))); // => true
// In your build: words.write("dist/fa-words");
```

For Pagefind, pass `words: createWordList({ analyzer })` to `faPagefindIndex`, then write the list after adding all pages. The CLI's `--words` does this for you. Pieces hold Persian words of at least three letters, grouped by first-letter class and length, with counts rounded down to powers of two (capped at 512). Filenames include a content hash; `write()` replaces previous generated manifest/piece files in the target directory.

In the browser, `fetchWords(url)` fetches the manifest and only the pieces requested by a weak spelling search. Loading that object alone makes no network request. Use an absolute URL in Node; browser-relative URLs resolve against the current page. Serve the manifest and pieces together, allow manifest revalidation, and do not gzip already gzipped bytes twice.

A remote word source supplies candidates, not known-term evidence. Supply `isKnown`, or still collect index terms with `addText`. For Pagefind, use `pagefindKnows(pagefind, fa)`; a bare result count can mistake fallback/prefix matches for known words. It checks only the top result fragment and is still a heuristic.

## Pagefind UI wiring

First complete the [Pagefind guide](guides/pagefind.md), build with `--words`, load the UI script/style, and provide `#search` and `#search-notice` containers. This sample uses Persian notice text; localize those labels for your audience.

```js browser
import { createAnalyzer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefind } from "fa-search-kit/pagefind";
import { rescuePagefindUI } from "fa-search-kit/pagefind/rescue";
const analyzer = createAnalyzer({ profile: "full", lexicon, verbs: "lemma" });
const fa = faPagefind({ analyzer });
const box = document.querySelector("#search-notice");
const bundlePath = new URL("./pagefind/", document.baseURI).href;
const rescue = rescuePagefindUI({
  fa, analyzer, bundlePath,
  wordsPath: new URL("./fa-words/", document.baseURI).href,
  onNotice(notice) {
    box.replaceChildren();
    if (!notice) return;
    const action = document.createElement("button");
    action.type = "button";
    if (notice.fixed) {
      box.append(`نتیجه‌ها برای «${notice.to}» `);
      action.textContent = `جستجوی «${notice.from}» به همان صورت`;
    } else {
      action.textContent = `منظورتان «${notice.to}» بود؟`;
    }
    action.addEventListener("click", () => notice.other());
    box.append(action);
  },
});
const ui = new PagefindUI({
  element: "#search", bundlePath,
  processTerm: rescue.processTerm,
  processResult: fa.processResult,
});
rescue.attach(ui);
```

The first search is synchronous and runs as typed. Rescue probes the same Pagefind bundle asynchronously, checks a proposed query, and reruns only if input still matches. `notice.other()` remembers an as-typed choice for that text. Custom JS UIs can combine `createRescue`, `fetchWords`, and `pagefindKnows` instead. This opt-in setup is not Eram's docs-search configuration.

## Limits and lifecycle

Real words absent from the site, names, Latin model codes, and ambiguous keyboard input can be corrected incorrectly. The speller does not repair Finglish, synonyms, arbitrary first-letter changes across piece groups, or widely different spellings. Three-letter words allow only a small sound-alike edit cost; shorter words are not spelling candidates. There is no exposed multi-suggestion list.

There is no remove/reset API for collected vocabulary, and known-word decisions are cached. Recreate rescue after changing the corpus, especially after a negative known-word probe: adding text does not invalidate that cache. See [known issues](recipes.md) and [API reference](api/rescue.md).
