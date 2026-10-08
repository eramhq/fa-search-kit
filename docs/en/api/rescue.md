---
title: "Rescue and keyboard API"
description: "Look up correction results, vocabulary sources, keyboard candidates, and Pagefind UI rescue."
---

# Rescue and keyboard API

See [query rescue](../query-rescue.md) for a complete search and notice flow. The modules below are independent public exports.

## fa-search-kit/rescue

`createRescue(options: RescueOptions): Rescue` requires `analyzer: Analyzer`. Optional `words: WordSource` supplies candidate pieces; optional `isKnown(word): boolean | Promise<boolean>` checks raw word text against your index. Without `words`, `addText` collects candidates; without `isKnown`, it checks query terms against collected index terms.

`Rescue` methods:

- `addText(text: string): void`: append terms and, if no external word source exists, vocabulary. There is no removal or cache invalidation.
- `check(query: string, found: number): Promise<Fix | undefined>`: propose one query rewrite using the typed result count. Does not search the final candidate.
- `rescueSearch<R>(search: (query: string) => R[] | Promise<R[]>, query: string): Promise<RescueResult<R>>`: search typed text, check it, and search a candidate to validate the fix. Search exceptions propagate.

`RescueResult<R>` contains `results: R[]`, `query: string` (the actual query for those results), and optional `fix: Fix`. `Fix` contains `from`, `to`, `pieces: string[]` (word-piece keys used), and `auto: boolean`. False means a suggestion with typed results; true means results for the correction. A successful keyboard-only path can use no spelling pieces.

`fetchWords(dir: string | URL, fetcher?: typeof fetch): FetchedWords` returns a lazy `WordSource` with readonly `bytes: number`. `WordSource.piece(key)` returns `Piece | undefined` synchronously or by promise. `Piece` is `Map<string, Word>` and `Word` is `[spelling: string, count: number]`. These keys are internal vocabulary-piece IDs, not query strings; normally let rescue request them.

Exported types are `RescueOptions`, `Fix`, `RescueResult`, `Rescue`, `FetchedWords`, `Piece`, `Word`, and `WordSource`. `WordList`, `wordKey`, `pieceKey`, the speller, and edit-distance helpers are not public exports from this module.

## fa-search-kit/rescue/build

`createWordList(options?: WordListOptions): WordListBuilder` accepts optional `analyzer`, default standard. It uses tokens, not stems; normalization/rejoin settings therefore matter, while verb mode does not change collected tokens.

`WordListBuilder` exposes `add(text): void`, readonly `list`, `files(): Map<string, Uint8Array>`, and `write(dir: string): number`. `list` is the collected word-list object with `add(token)` for already-normalized tokens, `piece(key)`, and `pieces`; use `add(text)` on the builder for ordinary text. `files()` returns `index.json` and gzip-compressed hashed pieces without writing. `write()` creates the folder, removes prior generated manifest/piece files, writes the new ones, and returns bytes written. Use a dedicated generated directory. `WordListOptions` and `WordListBuilder` are exported types; this module requires Node.

## fa-search-kit/keyboard

```js
import { keyboardCandidates } from "fa-search-kit/keyboard";
console.log(JSON.stringify(keyboardCandidates("nd[d"))); // => ["دیجی","ریجی"]
console.log(JSON.stringify(keyboardCandidates("سشپسعدل"))); // => ["samsung"]
```

`keyboardCandidates(run: string): string[]` tries all supported layouts and returns unique candidates excluding the input. Give it a raw whitespace-free run so shifted keys are preserved. A candidate is not an approved correction; check your index or use rescue.

`LAYOUTS: Record<string, string>` contains `isiri9147`, `win-legacy`, and `mac-legacy`. `toPersian(text, layout)` maps US keys to that layout; `toLatin(text, layout)` maps back, with unmapped characters passing through. `layoutCandidates(run, layout)` applies plausibility filters for one layout. Pass a layout string from `LAYOUTS`, not its name. `LETTERS` is an exported global regex for supported Persian/Arabic letters; reset `lastIndex` if repeatedly using stateful regex methods.

## fa-search-kit/pagefind/rescue

`pagefindKnows(pagefind: PagefindSearch | Promise<PagefindSearch>, fa: PagefindAdapter): (word: string) => Promise<boolean>` probes the first result's content. Persian terms can match prefixes; ASCII letter/digit terms must match whole words. `PagefindSearch` requires async `search(term)` returning results with async `data()` containing `content`.

`rescuePagefindUI(options: PagefindRescueOptions): PagefindRescueUI` accepts the shared analyzer options plus required `fa` and `bundlePath`; optional `wordsPath` defaults to sibling `fa-words/`, and optional `onNotice` receives `PagefindNotice | undefined`.

The returned object has `processTerm(term): string`, `attach(ui: { triggerSearch(term): void }): void`, readonly `rescue`, and readonly `words: FetchedWords`. Attach after creating the UI. The wrapper logs asynchronous rescue errors to the console. Ordinary typed search can still proceed.

`PagefindNotice` has `from`, `to`, `fixed: boolean`, and `other(): void`. Undefined clears a notice. With fixed true, the action searches as typed and remembers the choice; otherwise it searches the suggestion. The module exports the four named types `PagefindSearch`, `PagefindRescueOptions`, `PagefindRescueUI`, `PagefindNotice`, plus its two runtime functions. `PagefindAdapter` is imported from `/pagefind`, not re-exported here.
