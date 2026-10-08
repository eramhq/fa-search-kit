---
title: "Integrate Pagefind"
description: "Prepare Persian pages before indexing and process queries and excerpts in the browser."
---

# Integrate Pagefind

Pagefind needs both a build-time adapter and a browser adapter. Start from the [source installation](../installation.md), build your site's HTML into `dist`, and set the Persian pages' HTML language to `fa`.

## Annotate the built site

```sh
npm install pagefind@1.5.2
npx --no-install fa-search-kit-pagefind dist --profile full --verbs lemma
npx --no-install pagefind --site dist
```

The first command after installation modifies built HTML in place. It adds hidden analyzed terms and, by default, searchable title metadata while retaining the original title. Run it after generating HTML and before Pagefind. Existing generated blocks are replaced on repeated runs. Do not run it on authoring sources.

The default CLI profile is standard; `--profile full` loads the lexicon automatically. `--verbs lemma` makes the build setting explicit. Use the same options in the browser. Do not force the Arabic language: a second stemmer can alter the prepared terms.

Mark searchable regions with `data-pagefind-body` and exclude content with `data-pagefind-ignore`. If any page has a body marker, pages without one are excluded by Pagefind. The adapter's word collection follows that rule. Navigation, footer, scripts, forms, and other skipped elements are excluded in normal full-page processing. The annotator is a lightweight HTML parser; prefer complete, well-formed documents and verify unusual markup.

### Alternative Node build

Use this instead of rewriting the site files. `addPages` annotates content before handing it to Pagefind and returns its error strings. The example builds files in memory; uncomment `writeFiles` in your site build to save them.

```js
import * as pagefind from "pagefind";
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefindIndex } from "fa-search-kit/pagefind/build";
const { index, errors } = await pagefind.createIndex({ forceLanguage: "fa" });
if (!index || errors.length) throw new Error(errors.join("\n"));
try {
  const fa = faPagefindIndex({ profile: "full", lexicon, verbs: "lemma" });
  const failures = await fa.addPages(index, [{
    url: "/books/",
    content: '<html lang="fa"><body><main data-pagefind-body><h1>كتابهاي قديمي</h1></main></body></html>',
  }]);
  if (failures.length) throw new Error(failures.join("\n"));
  const { files } = await index.getFiles();
  console.log(JSON.stringify(files.length > 0)); // => true
  // For your site build: await index.writeFiles({ outputPath: "dist/pagefind" });
} finally {
  await pagefind.close();
}
```

## Query in the browser

Bundle the imports below. Serve the generated Pagefind directory over HTTP and set `bundleUrl` for your deployment base path; the relative URL here assumes that directory is beside the current page.

```js browser
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefind } from "fa-search-kit/pagefind";
const fa = faPagefind({ profile: "full", lexicon, verbs: "lemma" });
const bundleUrl = new URL("./pagefind/pagefind.js", document.baseURI).href;
const pagefind = await import(/* @vite-ignore */ bundleUrl);
const query = "کتاب";
const response = await pagefind.search(fa.processQuery(query));
const results = await Promise.all(response.results.slice(0, 10).map(async hit =>
  fa.processResult(await hit.data(), query)
));
console.log(results);
```

Always call `processResult` before rendering annotated results. It mutates and returns the result, reconstructs the main excerpt from visible text, removes hidden markers from sub-result excerpts, and restores the original title from `meta.fa_title`. Pass the raw query explicitly when using the JS API, especially with concurrent searches. Ignore stale responses in your UI.

### Pagefind UI alternative

Load Pagefind's generated `pagefind-ui.js` and its stylesheet and create a `#search` container before this bundled code runs. `PagefindUI` below is the global supplied by that script.

```js browser
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefind } from "fa-search-kit/pagefind";
const fa = faPagefind({ profile: "full", lexicon, verbs: "lemma" });
new PagefindUI({
  element: "#search",
  bundlePath: new URL("./pagefind/", document.baseURI).href,
  processTerm: fa.processTerm,
  processResult: fa.processResult,
});
```

`processTerm` remembers the query for `processResult`. Use one adapter instance per independently searching UI. The [text analysis guide](../text-analysis.md) describes excerpt behavior and the current supplementary-Unicode offset defect.

## Optional vocabulary and rescue

Add `--words` to annotation to write `dist/fa-words/`; `--words-dir` selects a different output directory and also enables vocabulary creation. Then wire [query rescue](../query-rescue.md) explicitly. Building a word list alone does not enable correction. Eram's Persian docs use the full/lemma setup above without rescue.

For `terms`, `weight`, `title`, and `surface` build options, see [adapter reference](../api/adapters.md).
