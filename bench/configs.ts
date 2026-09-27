/**
 * Benchmark configurations: how each engine is set up.
 *
 * - stock:    the engine's defaults, as a developer gets them from the README.
 * - tuned:    the best the engine offers today without extra code (its closest
 *             language option, and typo tolerance where it has one). Per engine:
 *             Orama `language: "arabic"` + `tolerance: 1`; MiniSearch `fuzzy: 0.2,
 *             prefix: true`; FlexSearch `tokenize: "forward"` + `suggest: true`
 *             (partial matches; its default requires every query word); Lunr `lunr.ar` from
 *             lunr-languages; Pagefind `forceLanguage: "ar"` (Arabic stemming).
 * - snowball: the naive fix: split on non-letters, run Snowball's Persian stemmer
 *             (3.1.1), and feed the engine the stems at index and query time.
 *             This is the bar Phase 1's analyzer has to clear.
 *
 * Every config ranks with a title boost of 2 where the engine supports one.
 */
import PersianStemmer from "../vendor/snowball/persian-stemmer.js";
import { rawTokens } from "./lib/persian.ts";

export interface Analyzer {
  name: string;
  /** Same function at index time and query time. */
  analyze(text: string): string[];
}

export interface Config {
  name: string;
  /** When set, the engine indexes and searches pre-analyzed terms with its own processing turned off. */
  analyzer?: Analyzer;
  tuned?: boolean;
}

const stemmer = new PersianStemmer();
const cache = new Map<string, string>();

export const snowballAnalyzer: Analyzer = {
  name: "snowball",
  analyze(text) {
    return rawTokens(text.toLowerCase()).map((t) => {
      let s = cache.get(t);
      if (s === undefined) { s = stemmer.stemWord(t); cache.set(t, s); }
      return s;
    }).filter(Boolean);
  },
};

export const CONFIGS: Config[] = [
  { name: "stock" },
  { name: "tuned", tuned: true },
  { name: "snowball", analyzer: snowballAnalyzer },
];
