/**
 * fa-search-kit/rescue: when the words as typed are a weak search, find what they were
 * meant to be. A keyboard left on English is fixed outright ("showing results for
 * «دیجی»; search «nd[d» as typed"); a misspelling is offered as a suggestion ("did you
 * mean «ساعت مچی»?"), and searched instead only when the words as typed find nothing.
 *
 *     import { createRescue } from "fa-search-kit/rescue";
 *     const rescue = createRescue({ analyzer });     // the adapter's analyzer
 *     for (const doc of docs) { index.add(doc); rescue.addText(doc.title + " " + doc.body); }
 *
 *     const { results, fix } = await rescue.rescueSearch((q) => index.search(q), input);
 *     if (fix?.auto) showNotice(`showing results for «${fix.to}»`, () => search(fix.from));
 *     else if (fix) showSuggestion(`did you mean «${fix.to}»?`, () => search(fix.to));
 *
 * Two separate questions:
 * - **Is a word on the site?** The search index decides (`isKnown`): by default the
 *   terms `addText` collected; for Pagefind, a probe search (fa-search-kit/pagefind/rescue).
 *   So spellings the analyzer already handles (joined «کتابخانه», «کتابهایم», Arabic ي)
 *   are never "fixed".
 * - **What should it be?** Keyboard layouts first (`nd[d` → «دیجی», «سشپسعدل» → samsung),
 *   then the speller over the site's own words (`words`: what `addText` collected, or a
 *   list built with the site, see fa-search-kit/rescue/build).
 *
 * A search is weak when a query word is unknown to the index or nothing is found. A fix is
 * kept only if the index knows the fixed word and the fixed search finds something.
 * (Replacing every misspelled search also rewrote real words the site does not have,
 * 24–59% of them: bench/results/phase3.md; suggestions leave the choice to the visitor.)
 */
import type { Analyzer } from "../analyzer.ts";
import { LAYOUTS, LETTERS, layoutCandidates } from "./keyboard.ts";
import { spell, reach } from "./speller.ts";
import { WordList, persian, piecesFor, wordKey, type WordSource } from "./words.ts";

export { fetchWords, type FetchedWords, type Piece, type Word, type WordSource } from "./words.ts";

export interface RescueOptions {
  /** The analyzer the search index uses (share the adapter's: `analyzer` option, or `adapterAnalyzer`). */
  analyzer: Analyzer;
  /** The site's words: `fetchWords(url)` for a built list. Default: what `addText` collected. */
  words?: WordSource;
  /**
   * Whether the index knows a word (its raw text). Default: every query term of the
   * word is among the terms `addText` collected.
   */
  isKnown?: (word: string) => boolean | Promise<boolean>;
}

export interface Fix {
  /** The query as typed. */
  from: string;
  /** The query searched instead, fixed words in the site's own spelling. */
  to: string;
  /** Word pieces the speller used (see words.ts); empty when only keyboard fixes were made. */
  pieces: string[];
  /**
   * true: the results are for `to` (keyboard fixes only, or nothing found as typed);
   * false: the results are as typed and `to` is a suggestion ("did you mean").
   */
  auto: boolean;
}

export interface RescueResult<R> {
  results: R[];
  /** The query the results are for. */
  query: string;
  /** A fix that finds something: searched instead (`fix.auto`) or a suggestion. */
  fix?: Fix;
}

export interface Rescue {
  /** Collect a document's terms and words, next to indexing it. */
  addText(text: string): void;
  /** A fix for `query`, given how many results it found as typed; undefined when it is not weak or nothing fits. */
  check(query: string, found: number): Promise<Fix | undefined>;
  /**
   * Search as typed; when that is weak and a fix finds something, the fixed search
   * (`fix.auto`) or the results as typed with the fix as a suggestion.
   */
  rescueSearch<R>(search: (query: string) => R[] | Promise<R[]>, query: string): Promise<RescueResult<R>>;
}

/** A run of Latin keys (letters, digits, the punctuation keys that are Persian letters). */
const LATIN = /^[!-~]*[A-Za-z][!-~]*$/, PUNCT = /[^A-Za-z\d]/;
type Edit = { start: number; end: number; text: string };

export function createRescue(options: RescueOptions): Rescue {
  const { analyzer } = options;
  const terms = new Set<string>();
  const list = new WordList();
  const words = options.words ?? list;
  const known = new Map<string, boolean | Promise<boolean>>();
  const isKnown = options.isKnown ?? ((w: string) => {
    const t = analyzer.analyze(w, { mode: "query" });
    return t.length > 0 && t.every((x) => terms.has(x));
  });
  /** Cached: a probe search is not free. */
  const knows = (w: string) => {
    let k = known.get(w);
    if (k === undefined) known.set(w, (k = isKnown(w)));
    return k;
  };

  async function check(query: string, found: number): Promise<Fix | undefined> {
    const tokens = analyzer.tokens(query);
    const unknown = new Set<(typeof tokens)[number]>();
    if (options.isKnown || terms.size) for (const t of tokens) if (!(await knows(t.text))) unknown.add(t);
    // Weak: a word the index does not know, or nothing found ("nothing found" alone misses
    // most typos on Pagefind and every keyboard fix on OR engines: R1).
    if (found > 0 && !unknown.size) return undefined;

    // Keyboard, on the raw text split at spaces: the tokenizer would split «nd[d» at «[»,
    // and normalizing lowercases shifted keys (Shift+C = ژ).
    const runs: { run: string; start: number; long: boolean }[] = [];
    for (const { 0: run, index: start } of query.matchAll(/\S+/g)) {
      const end = start + run.length, latin = LATIN.test(run), inner = PUNCT.test(run.slice(1, -1));
      // Known as typed (a Latin run with punctuation inside is no word: the tokenizer finds parts of it).
      if (!(latin && inner) && tokens.every((t) => t.end <= start || t.start >= end || !unknown.has(t))) continue;
      // Short Latin runs need proof: «tv» is «فر» on the wrong layout, and an English word.
      if (latin || (run.match(LETTERS) && run.length >= 3)) runs.push({ run, start, long: !latin || run.length >= 3 || PUNCT.test(run) });
    }
    // The query was typed on one layout: take the one under which the most runs become
    // known words, a long run among them (the proof for short ones: «;jhf ih» = «کتاب ها»).
    let edits: Edit[] = [], best = 0;
    for (const layout of Object.values(LAYOUTS)) {
      const e: Edit[] = [];
      let score = 0;
      for (const r of runs) {
        for (const c of layoutCandidates(r.run, layout)) {
          if (c === r.run || !(await knows(c))) continue;
          e.push({ start: r.start, end: r.start + r.run.length, text: c });
          score += r.long ? 1 : 0.1;
          break;
        }
      }
      if (score >= 1 && score > best) { edits = e; best = score; }
    }
    // Keyboard fixes are near certain; spelling fixes replace the search only when nothing was found.
    const keyboard = edits.length;

    const pieces = new Set<string>();
    const near = async (key: string, rare = false) => {
      const keys = piecesFor(key, Math.floor(reach(key.length)));
      for (const k of keys) pieces.add(k);
      return spell(key, await Promise.all(keys.map((k) => words.piece(k))), rare);
    };
    const speller = (t: (typeof tokens)[number]) => {
      const key = wordKey(t.text);
      return !edits.some((e) => t.start < e.end && t.end > e.start) && reach(key.length) && persian(key) ? key : "";
    };
    for (const t of unknown) {
      const key = speller(t);
      const fix = key && (await near(key));
      if (fix && (await knows(fix[0]))) edits.push({ start: t.start, end: t.end, text: fix[0] });
    }
    // Nothing found and every word known (R9): a rare word may be a typo the site also has;
    // the one whose close word is most common (10× at least) is fixed.
    if (!found && !edits.length) {
      let pick: Edit | undefined, ratio = 0;
      for (const t of tokens) {
        const key = speller(t);
        const fix = key && (await near(key, true));
        if (fix && fix[2] > ratio && (await knows(fix[0]))) { pick = { start: t.start, end: t.end, text: fix[0] }; ratio = fix[2]; }
      }
      if (pick) edits.push(pick);
    }
    if (!edits.length) return undefined;
    let to = "", at = 0;
    for (const e of edits.sort((a, b) => a.start - b.start)) { to += query.slice(at, e.start) + e.text; at = e.end; }
    return { from: query, to: to + query.slice(at), pieces: [...pieces], auto: !found || edits.length === keyboard };
  }

  return {
    addText(text) {
      for (const t of analyzer.analyze(text, { mode: "index" })) terms.add(t);
      if (!options.words) for (const t of analyzer.tokens(text)) list.add(t.text);
    },
    check,
    async rescueSearch(search, query) {
      const results = await search(query);
      const fix = await check(query, results.length);
      if (fix) {
        const fixed = await search(fix.to);
        if (fixed.length) return fix.auto ? { results: fixed, query: fix.to, fix } : { results, query, fix };
      }
      return { results, query };
    },
  };
}
