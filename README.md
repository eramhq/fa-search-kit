# fa-search-kit

Persian search that works in JavaScript, the browser and static sites.

Browser search engines treat Persian like English: a page spelled with Arabic
«ي»/«ك» cannot be found by someone typing Persian «ی»/«ک», «می روم» typed with a
space misses «می‌روم», «کتابهایمان» misses «کتاب», and «۳۰» misses «30». fa-search-kit is
one analyzer (normalize → tokenize → Snowball stem → lexicon) used the same way at
index time and at query time, with drop-in adapters for **Pagefind**, **Orama**,
**MiniSearch**, **FlexSearch** and **Lunr**. Every default was chosen by a public
benchmark of real Persian pages and the ways people actually type ([bench/](bench/README.md)).

> Status: not published to npm yet. Build it from this repo (`npm run build`) or
> `npm pack` it.

## Install

```sh
npm install fa-search-kit
```

Zero runtime dependencies. The search engines are optional peer dependencies: the
adapters take the engine you already use and never import one themselves.

## Profiles

| profile | what it does | gzip |
|---|---|---:|
| `light` | normalize (Arabic ي/ك/ة, hamza forms, digits, diacritics, stretched letters, ZWNJ cleanup) + tokenize (rejoin «می روم», «کتاب ها») | in the core |
| `standard` (default) | + Snowball's Persian stemmer (3.1.1) with the fixes it needs: joined «میروم», closed suffixes after a half-space, compound parts, both half-space spellings, آ typed as ا | core: **4.95 KB** |
| `full` | + `fa-search-kit/lexicon`: present → past verb stems («می‌روم», «رفتند» → «رفت»), possessive clitics, broken plurals (کتب → کتاب), a keep list against over-stemming | + 7.83 KB |

Each adapter adds 0.1–0.5 KB to the core. `node scripts/size.ts` enforces the budgets.

```js
import { createAnalyzer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";

const standard = createAnalyzer();                      // profile "standard"
const full = createAnalyzer({ profile: "full", lexicon });
standard.analyze("كتابهاي من", { mode: "query" });     // ["کتاب", "من"]
standard.analyze("كتابهاي من");                         // ["کتاب", "کتابه", "من"]  (index mode: also «کتابه‌ای»'s term)
full.analyze("می روم", { mode: "query" });              // ["رفت"]
```

Index mode may emit extra terms (a half-space compound's parts, the other
half-space spelling, the word without its madda); query mode emits one term per
word; the query terms of a text are always among its index terms.

Every adapter takes the same options: `profile`, `lexicon` (implies `profile:
"full"`), `verbs`, the analyzer's switches, or a ready `analyzer`. **Use the same
options on the index side and the query side.** The verb setting defaults per
engine: past-stem lemmas where every query word must match (Pagefind, FlexSearch,
MiniSearch with `combineWith: "AND"`), tense-keeping stems where any may.

## Pagefind

Pagefind indexes HTML, so the index side adds the analyzer's terms to each page in
a hidden block (the page's own text stays as it is), and the query side analyzes
what the visitor types.

```sh
npx fa-search-kit-pagefind dist      # annotate the built site in place (--profile full for the lexicon)
npx pagefind --site dist
```

```js
import { faPagefind } from "fa-search-kit/pagefind";

const fa = faPagefind();             // same options as the CLI
new PagefindUI({ element: "#search", processTerm: fa.processTerm, processResult: fa.processResult });

// or the JS API
const search = await pagefind.search(fa.processQuery(input));
const data = fa.processResult(await search.results[0].data(), input);
```

With the Node API, `faPagefindIndex(options).addPages(index, [{ url, content: html }])`
from `fa-search-kit/pagefind/build`. Pages must be `<html lang="fa">` (Pagefind has no
Persian stemmer; another language's stemmer would stem the terms again).

**Use `processResult`.** Pagefind shows hidden text in excerpts like any other, so
an excerpt can land on the block of terms; and because Pagefind ranks matches in
the page title far above the rest, the index side gives Pagefind the title's
analyzed terms as its title meta (a page typed with Arabic «ي»/«ك» would otherwise
lose that boost) and keeps the real title as meta `fa_title`. `processResult`
rebuilds the excerpt from the page's visible text, marks the words that matched, and
puts the real title back. The layout (`terms`, `title`, `surface` options of
`faPagefindIndex`) was chosen by experiment: [bench/results/experiments.md](bench/results/experiments.md), P1.

## Orama

```js
import { create, insert, search } from "@orama/orama";
import { faTokenizer } from "fa-search-kit/orama";

const db = create({ schema: { title: "string", body: "string" }, components: { tokenizer: faTokenizer() } });
await insert(db, { title: "كتابهاي قديمي", body: "…" });
await search(db, { term: "کتاب" });
```

Do not also pass `language` to `create` (Orama rejects it with a custom tokenizer).
Orama matches every query term as a prefix and adds up the scores of all words it
prefixes; the tokenizer ends every term with a sentinel so a term only matches
itself (`exactTerms: false` turns that off).

## MiniSearch

```js
import MiniSearch from "minisearch";
import { faMiniSearch } from "fa-search-kit/minisearch";

const fa = faMiniSearch();           // faMiniSearch({ combineWith: "AND" }) if you search with AND
const ms = new MiniSearch({ fields: ["title", "body"], ...fa, searchOptions: { ...fa.searchOptions, boost: { title: 2 } } });
```

## FlexSearch

```js
import FlexSearch from "flexsearch";
import { faDocument, faEncode } from "fa-search-kit/flexsearch";

// Recommended: analyzes in index mode while adding, in query mode while searching.
const index = faDocument(FlexSearch, { document: { id: "id", index: ["title", "body"], store: true } });

// Drop-in: one encoder for both sides (FlexSearch cannot tell them apart), so query
// mode on both: no compound parts or madda-less spellings at index time.
const plain = new FlexSearch.Document({ document: { id: "id", index: ["title"] }, encode: faEncode() });
```

`faDocument` switches modes around `add`, `append` and `update`; do not use it with
`worker` or the `*Async` methods.

## Lunr

```js
import lunr from "lunr";
import { faLunr } from "fa-search-kit/lunr";

const fa = faLunr(lunr);
const idx = lunr(function () { this.use(fa); this.ref("id"); this.field("title"); this.field("body"); docs.forEach((d) => this.add(d)); });
fa.search(idx, "کتاب‌های من");      // not idx.search(): Lunr's query parser skips the tokenizer
```

`fa.search` treats Lunr's query syntax (`: ~ ^ + - *`) as text, so a visitor's
input never throws.

## Query rescue: wrong keyboard, typos, sound-alike letters (optional)

When the words as typed are a weak search, fa-search-kit can search fixed words instead
and say so: *showing results for «دیجی کالا» · search «nd[d ;hgh» as typed*. It fixes a
query typed with the keyboard on the wrong layout (`nd[d` → «دیجی», on the standard,
legacy Windows and Mac layouts, and Persian letters that spell a Latin name back:
«سشپسعدل» → samsung), and misspelled words: sound-alike letters (ت/ط, س/ص/ث, ز/ذ/ض/ظ,
ه/ح, ق/غ), a neighbouring key, a missing or doubled letter, two letters swapped.

Two separate questions decide it:
- **Is a word on the site?** The search index answers, not a word list, so spellings the
  analyzer already handles («کتابخانه» typed joined, «کتابهایم», Arabic ي) are never "fixed".
- **What should it be?** The site's own words: a keyboard layout under which the query
  becomes known words, else the closest word the site uses (costed for Persian: sound-alike
  letters and neighbouring keys are cheap), most common first.

A fix is kept only if the fixed search finds something. Everything is a separate import;
a site that does not use it ships exactly what it did before.

| entry | what | gzip |
|---|---|---:|
| `fa-search-kit/rescue` | `createRescue`, `rescueSearch` for any engine | core + 2.57 KB |
| `fa-search-kit/pagefind/rescue` | Pagefind UI wiring | `/pagefind` + 3.05 KB (with rescue) |
| `fa-search-kit/keyboard` | `keyboardCandidates(text)` on its own | 0.79 KB |
| `fa-search-kit/rescue/build` | the site's word list, written in pieces (build time) | – |
| `fa-search-kit/analytics` | `canonicalKey(query)` for search logs | core + 0.07 KB |

### With an in-browser engine (Orama, MiniSearch, FlexSearch, Lunr)

```js
import { createAnalyzer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";
import { faMiniSearch } from "fa-search-kit/minisearch";
import { createRescue } from "fa-search-kit/rescue";

// One analyzer for the adapter and the rescue (verbs: "stem" where any query word may match).
const analyzer = createAnalyzer({ profile: "full", lexicon, verbs: "stem" });
const fa = faMiniSearch({ analyzer });
const ms = new MiniSearch({ fields: ["title", "body"], ...fa });
const rescue = createRescue({ analyzer });
for (const doc of docs) { ms.add(doc); rescue.addText(`${doc.title} ${doc.body}`); }

const { results, fix } = await rescue.rescueSearch((q) => ms.search(q), input);
if (fix) showNotice(`نتیجه برای «${fix.to}»`, () => ms.search(fix.from));   // offer the text as typed
```

`addText` collects the index's terms (to tell known words) and the site's words (for the
speller) in memory; nothing is downloaded.

### With Pagefind

Build the word list with the pages, next to Pagefind's folder:

```sh
npx fa-search-kit-pagefind dist --profile full --words    # writes dist/fa-words/
npx pagefind --site dist
```

```js
import { faPagefind } from "fa-search-kit/pagefind";
import { rescuePagefindUI } from "fa-search-kit/pagefind/rescue";

const fa = faPagefind({ profile: "full", lexicon });
const rescue = rescuePagefindUI({ fa, profile: "full", lexicon, bundlePath: "/pagefind/", onNotice });
const ui = new PagefindUI({ element: "#search", bundlePath: "/pagefind/", processTerm: rescue.processTerm, processResult: fa.processResult });
rescue.attach(ui);

function onNotice(n) {              // called on every search; undefined clears the notice
  box.hidden = !n;
  if (n) { box.querySelector("b").textContent = n.fixedTo; link.onclick = () => n.asTyped(); }
}
```

Pagefind UI asks for the query synchronously, so the first search is as typed; meanwhile
the rescue asks the UI's own `pagefind.js` whether each word is on the site (Pagefind
silently drops words it does not know, so "no results" misses most typos), downloads only
the word pieces the weak search needs (never on page load; a median of 3 KB on a 20,000-product shop, 18 KB on 20,000 long articles), and reruns
the UI with the fix. Custom UIs on Pagefind's JS API use `createRescue` with
`fetchWords("/fa-words/")` and `pagefindKnows(pagefind, fa)` from the same entry.

### What it gets right, and what it gets wrong

Recall@10 in %, test split, fa-full → with rescue (every query is a page's title words,
rewritten the way people mistype):

| variant | Pagefind | Orama | MiniSearch | FlexSearch | Lunr |
|---|---|---|---|---|---|
| sound-alike letter (wiki) | 11 → 89 | 28 → 94 | 29 → 94 | 1 → 92 | 29 → 94 |
| neighbouring key (wiki) | 15 → 84 | 25 → 90 | 24 → 90 | 1 → 86 | 24 → 89 |
| two letters swapped (products) | 6 → 82 | 58 → 88 | 60 → 88 | 0 → 82 | 59 → 89 |
| a letter left out (wiki) | 30 → 55 | 26 → 55 | 24 → 54 | 4 → 39 | 24 → 53 |
| English keyboard, standard layout (news) | 0 → 95 | 0 → 99 | 0 → 100 | 0 → 79 | 0 → 98 |
| English keyboard, legacy Mac (wiki) | 0 → 70 | 1 → 72 | 1 → 73 | 0 → 66 | 1 → 72 |
| Latin name typed on Persian (products) | 19 → 93 | 49 → 98 | 49 → 98 | 0 → 94 | 49 → 98 |

No row gets worse (335 cells, none down), and correctly spelled queries are searched as
typed 98–99.7% of the time.

**MiniSearch**: also set its own `fuzzy: 0.2` (`searchOptions: { ...fa.searchOptions, fuzzy: 0.2 }`),
with or without rescue; it passed the benchmark and adds to it. Orama's `tolerance` and Lunr's
edit distance cost 8–21 points of ranking on Persian: leave them off.

The cost: a real word that is **not on the site** but is one edit away from a site word
is "fixed" too (24–59% of such words in the benchmark's guard set, depending on the site; names and Latin words far less; tokens with digits almost never); the notice and the "as typed" link are there for that.
Typos that change the first letter into another letter group are not fixed (the word
pieces are split by first letter). Full numbers and every decision:
[bench/results/phase3.md](bench/results/phase3.md), [bench/results/experiments.md](bench/results/experiments.md) (Phase 3).

### Search logs

```js
import { canonicalKey } from "fa-search-kit/analytics";
canonicalKey("كتاب") === canonicalKey("کتاب") && canonicalKey("کتاب") === canonicalKey("کتابها");   // "1:کتاب"
```

The key carries a version prefix; keys change with the analyzer's profile and options and
with package versions, so pass your analyzer (and your own prefix) and regroup when it changes.

## What the benchmark shows

Known-item search over 20,000 Persian Wikipedia articles, 20,000 news articles and
20,000 Digikala product titles; each query is a page's title words, rewritten the way
people type (Arabic letters, no half-space, a space instead of one, plural, clitic,
another tense, digits, …). Recall@10, test split, **stock engine → with fa-search-kit's
adapter (full profile)**:

| variant | Pagefind | Orama | MiniSearch | FlexSearch | Lunr |
|---|---|---|---|---|---|
| Arabic ي/ك typed (news) | 8 → 100 | 0 → 100 | 60 → 100 | 0 → 100 | 0 → 99 |
| page spelled with Arabic letters (products) | 25 → 83 | 2 → 87 | 23 → 88 | 7 → 91 | 2 → 88 |
| half-space typed as a space (news) | 21 → 99 | 1 → 100 | 88 → 100 | 100 → 99 | 1 → 98 |
| Latin ↔ Persian digits (wiki) | 11 → 100 | 6 → 100 | 64 → 100 | 8 → 100 | 5 → 100 |
| possessive clitic added (wiki) | 12 → 75 | 0 → 86 | 75 → 86 | 3 → 74 | 0 → 87 |
| verb in another tense (news) | 22 → 97 | 1 → 98 | 99 → 98 | 11 → 93 | 1 → 96 |
| two differences at once (wiki) | 10 → 97 | 0 → 97 | 26 → 99 | 13 → 99 | 0 → 98 |

Stock Orama and Lunr index no Persian at all (their tokenizers drop the letters).
Full tables, the method and every decision: [bench/results/phase3.md](bench/results/phase3.md) (query rescue), [bench/results/phase2.md](bench/results/phase2.md),
[bench/results/phase1.md](bench/results/phase1.md), [bench/README.md](bench/README.md).
Typos and wrong keyboard layouts: see query rescue above.

## Demo

`node demo/build.ts` builds a static site of 300 Persian Wikipedia articles and 300
Digikala products with two search boxes side by side (stock Pagefind and Pagefind
with fa-search-kit and its query rescue) and a replay of the benchmark's queries; `node demo/check.ts`
runs the replay headless, and `node demo/browser-check.ts` clicks through the page in
headless Chrome. It needs the benchmark data (`bench/README.md`). The
demo quotes CC BY-SA text, so it is CC BY-SA and never part of the package.

## Data and licence

MIT. Shipped data: the Snowball stemmer (BSD-3-Clause), Hazm's verb stems (MIT) and
word lists this project built; every item and its source is listed in
[DATA-SOURCES.md](DATA-SOURCES.md). CC BY-SA and other third-party text (Wikipedia,
UD treebanks, the news and product corpora) is used for evaluation only.

## Development

```sh
npm test                    # vitest: analyzer, adapters with the real engines
npm run typecheck
npm run build               # dist/
node scripts/size.ts        # size budgets, on src/ and dist/
node scripts/smoke-pack.ts  # npm pack → fresh project → every subpath, bundled and queried
```

Plan and status: [PLAN.md](PLAN.md). Research notes: [RESEARCH.md](RESEARCH.md).
