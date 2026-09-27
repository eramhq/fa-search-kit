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
 * - fa-light / fa-standard / fa-full: fa-search's own analyzer profiles (src/).
 * - experiment arms (H1–H10, bench/results/experiments.md): fa-* with one option
 *   changed; run only when named. Each arm was run against the profile defaults
 *   of its time (the base named in experiments.md); the defaults have since moved
 *   to the winners, so re-running an arm now measures something slightly different.
 *
 * Every config ranks with a title boost of 2 where the engine supports one.
 */
import PersianStemmer from "../vendor/snowball/persian-stemmer.js";
import { createAnalyzer, type AnalyzerOptions } from "../src/index.ts";
import { createLexicon, lexicon } from "../src/lexicon/index.ts";
import { KEEP, PLURALS, VERBS } from "../src/lexicon/data.ts";
import { CORPORA } from "./corpus.ts";
import { loadQueries } from "./queries.ts";
import { splitOf } from "./lib/split.ts";
import { rawTokens } from "./lib/persian.ts";

export type Mode = "index" | "query";

export interface Analyzer {
  name: string;
  /**
   * Same function at index time and query time. Index mode may emit extra terms;
   * query mode emits one term per token, and its terms are a subset of what
   * index mode emits for the same text.
   */
  analyze(text: string, mode: Mode): string[];
}

export interface Config {
  name: string;
  /** When set, the engine indexes and searches pre-analyzed terms with its own processing turned off. */
  analyzer?: Analyzer;
  /** For engines that match any query word (MiniSearch, Orama, Lunr), when it differs from `analyzer`. */
  anyWordAnalyzer?: Analyzer;
  tuned?: boolean;
  /** An experiment arm: run and reported only when named (`--config`). */
  experiment?: boolean;
}

const stemmer = new PersianStemmer();
const cache = new Map<string, string>();

export const snowballAnalyzer: Analyzer = {
  name: "snowball",
  analyze(text, _mode) {
    return rawTokens(text.toLowerCase()).map((t) => {
      let s = cache.get(t);
      if (s === undefined) { s = stemmer.stemWord(t); cache.set(t, s); }
      return s;
    }).filter(Boolean);
  },
};

/** fa-search's analyzer as a bench config. The lexicon is loaded lazily so configs without it stay cheap. */
function fa(name: string, options: AnalyzerOptions, experiment = false): Config {
  let analyzer: ReturnType<typeof createAnalyzer> | undefined;
  const get = () => (analyzer ??= createAnalyzer(options));
  return { name, experiment, analyzer: { name, analyze: (text, mode) => get().analyze(text, { mode }) } };
}

export const CONFIGS: Config[] = [
  { name: "stock" },
  { name: "tuned", tuned: true },
  { name: "snowball", analyzer: snowballAnalyzer },
  fa("fa-light", { profile: "light" }),
  fa("fa-standard", { profile: "standard" }),
  // fa-full: verb lemmas for engines that require every query word, tense-keeping
  // stems for engines that match any word (H10, bench/results/experiments.md).
  { ...fa("fa-full", { profile: "full", lexicon }), anyWordAnalyzer: fa("fa-full/any", { profile: "full", lexicon, verbs: "stem" }).analyzer },
  // Kept for reference and the held-out diagnostic. The Phase 1 experiment arms (H1–H10)
  // are defined, with their exact options and bases, in bench/results/experiments.md;
  // they were removed from here when their options were decided (several options no
  // longer exist, and the profile defaults moved to the winners).
  fa("fa-full-lemma", { profile: "full", lexicon, verbs: "lemma" }, true),
  // fa-full as reported in phase1.md (joined «می» by lexicon only), before the rule fallback.
  { ...fa("fa-full-v1", { profile: "full", lexicon, joinedMi: "lexicon" }, true), anyWordAnalyzer: fa("fa-full-v1/any", { profile: "full", lexicon, joinedMi: "lexicon", verbs: "stem" }).analyzer },
  fa("fa-full-heldout", { profile: "full", get lexicon() { return heldOutLexicon(); } }, true),
  // The light profile before H7's decision; its runs were fa-light's until then.
  fa("h7-light-none", { profile: "light", alefMadda: false }, true),
];

let heldOut: ReturnType<typeof createLexicon> | undefined;
function heldOutLexicon() {
  if (heldOut) return heldOut;
  const out = new Set<string>();
  for (const corpus of CORPORA) {
    for (const q of loadQueries(corpus)) if (q.lemma && splitOf(q.base) === "test") out.add(q.lemma.split("#")[0]!);
  }
  const verbs = VERBS.split(" ").filter((pair) => !out.has(pair.split("#")[0]!)).join(" ");
  return (heldOut = createLexicon(verbs, KEEP, PLURALS));
}

export const configByName = (name: string) => {
  const c = CONFIGS.find((x) => x.name === name);
  if (!c) throw new Error(`unknown config ${name}; known: ${CONFIGS.map((x) => x.name).join(", ")}`);
  return c;
};
