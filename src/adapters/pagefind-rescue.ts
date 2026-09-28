/**
 * fa-search-kit/pagefind/rescue: query rescue for Pagefind UI.
 *
 *     const fa = faPagefind({ profile: "full", lexicon });
 *     const rescue = rescuePagefindUI({ fa, profile: "full", lexicon, bundlePath: "/pagefind/", onNotice });
 *     const ui = new PagefindUI({ element: "#search", bundlePath: "/pagefind/", processTerm: rescue.processTerm, processResult: fa.processResult });
 *     rescue.attach(ui);
 *
 *     function onNotice(n) {   // draw it where you like; undefined clears it
 *       notice.hidden = !n;
 *       if (n) notice.innerHTML = `showing results for «${n.fixedTo}» · <a>search «${n.fixedFrom}» as typed</a>`;
 *       // and on the link's click: n.asTyped()
 *     }
 *
 * Build with the word list (`npx fa-search-kit-pagefind dist --words`, or `words` in
 * fa-search-kit/pagefind/build), and pass the same analyzer options as there.
 *
 * Pagefind UI calls `processTerm` synchronously, so the first search is as typed.
 * Meanwhile the rescue asks the UI's own pagefind.js (the same module, never
 * re-initialized) whether each word is on the site (`pagefindKnows`); Pagefind drops
 * unknown words silently, so "no results" alone misses most typos. On a weak search it tries the
 * keyboard layouts, then downloads the word pieces it needs and runs the speller. If
 * the fix finds something and the box still holds the same text, the UI is rerun
 * with a trailing space toggled (`triggerSearch` with the same text does nothing),
 * which finds the cached fix. Custom UIs on Pagefind's JS API can use `rescueSearch`
 * from fa-search-kit/rescue directly.
 */
import { createRescue, fetchWords, type FetchedWords, type Rescue } from "../rescue/index.ts";
import { folder } from "../rescue/words.ts";
import type { PagefindAdapter } from "./pagefind.ts";
import { adapterAnalyzer, type AdapterOptions } from "./shared.ts";

export interface PagefindNotice {
  /** The text as typed. */
  fixedFrom: string;
  /** The text searched instead. */
  fixedTo: string;
  /** Search the text as typed (and remember that choice for this text). */
  asTyped(): void;
}

export interface PagefindRescueOptions extends AdapterOptions {
  /** The query side (fa-search-kit/pagefind), for `processTerm` and `processQuery`. */
  fa: PagefindAdapter;
  /** Pagefind UI's `bundlePath`: the rescue imports the same pagefind.js. */
  bundlePath: string;
  /** Where the word list is (default: `fa-words/` next to the bundle folder, as the CLI writes it). */
  wordsPath?: string;
  /** Called on every search: the fix shown, or undefined. */
  onNotice?(notice: PagefindNotice | undefined): void;
}

export interface PagefindRescueUI {
  /** For Pagefind UI's `processTerm` option (instead of `fa.processTerm`). */
  processTerm(term: string): string;
  /** The UI to rerun when a fix is found. Call once, after creating it. */
  attach(ui: { triggerSearch(term: string): void }): void;
  readonly rescue: Rescue;
  /** The word list, fetched piece by piece (`bytes`: downloaded so far). */
  readonly words: FetchedWords;
}

/** What the rescue uses of pagefind.js. */
export interface PagefindSearch {
  search(term: string): Promise<{ results: { data(): Promise<{ content: string }> }[] }>;
}

/** A word as Pagefind indexes it: lowercased, marks stripped after NFD, joined at ZWNJ. */
const indexed = (w: string) => w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replaceAll("\u200c", "");

/**
 * Whether the index knows a word. A result count cannot tell: Pagefind finds a word it
 * does not know through a shorter prefix («اسلایم» → «اسلا»). So the word counts as known
 * when the top result (one fragment) has a word starting with each of its query terms
 * (as Pagefind matches), or, for a Latin or digit term, the whole word.
 */
export function pagefindKnows(pagefind: PagefindSearch | Promise<PagefindSearch>, fa: PagefindAdapter): (word: string) => Promise<boolean> {
  return async (word) => {
    const q = fa.processQuery(word);
    const top = q && (await (await pagefind).search(q)).results[0];
    if (!top) return false;
    const words = (await top.data()).content.split(/[^\p{L}\p{N}\p{M}\u200c]+/u).map(indexed);
    // A Latin or digit term must be a whole word: short Latin strings begin many words («jd», «vk»).
    return q.split(" ").map(indexed).every((t) => words.some(/^[a-z\d]+$/.test(t) ? (w) => w === t : (w) => w.startsWith(t)));
  };
}

export function rescuePagefindUI(options: PagefindRescueOptions): PagefindRescueUI {
  const { fa, onNotice } = options;
  const bundle = folder(options.bundlePath);
  let pagefind: Promise<PagefindSearch> | undefined;
  const module = () => (pagefind ??= import(/* @vite-ignore */ `${bundle}pagefind.js`));
  const count = async (q: string) => (await (await module()).search(fa.processQuery(q))).results.length;
  const words = fetchWords(options.wordsPath ?? new URL("../fa-words/", bundle));
  const known = pagefindKnows({ search: async (q) => (await module()).search(q) }, fa);
  const rescue = createRescue({ analyzer: adapterAnalyzer(options, "lemma"), words, isKnown: known });
  const fixes = new Map<string, string>(), typed = new Set<string>();
  let ui: { triggerSearch(term: string): void } | undefined;
  let current = "";
  // Rerun the same text: the trailing space makes Pagefind UI search again.
  const rerun = () => ui?.triggerSearch(current.endsWith(" ") ? current.trimEnd() : current + " ");

  async function check(term: string, text: string) {
    const fix = await rescue.check(text, await count(text));
    if (!fix || !(await count(fix.to))) return;
    fixes.set(text, fix.to);
    if (current === term) rerun();
  }

  return {
    rescue,
    words,
    attach(u) { ui = u; },
    processTerm(term) {
      current = term;
      const text = term.trim();
      const fix = fixes.get(text);
      if (text && !typed.has(text) && fix) {
        onNotice?.({ fixedFrom: text, fixedTo: fix, asTyped() { typed.add(text); rerun(); } });
        return fa.processTerm(fix);
      }
      onNotice?.(undefined);
      if (text && !typed.has(text)) check(term, text).catch((e) => console.warn("fa-search-kit rescue:", e));
      return fa.processTerm(term);
    },
  };
}
