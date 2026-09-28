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
 * - fa-light / fa-standard / fa-full: fa-search-kit's profiles, set up **through the
 *   shipped adapters** (src/adapters/), as a site would: each engine gets the
 *   adapter's tokenizer / encoder / plugin, Pagefind gets annotated HTML.
 * - p1-light / p1-standard / p1-full: the same profiles through Phase 1's bench
 *   wiring (pre-analyzed text, engine processing off); the Phase 2 gate's baseline.
 *   Their runs are Phase 1's fa-* runs, copied (bench/results/phase2.md).
 * - fa-rescue: fa-full through the adapters plus query rescue (fa-search-kit/rescue),
 *   set up as a site would: in-browser engines collect terms and words with
 *   `rescue.addText` next to indexing; Pagefind builds the word list while annotating
 *   and asks the index itself (a probe search) whether a word is known.
 * - experiment arms (H1–H10, P1–P4, R1–R10, bench/results/experiments.md): one option
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

/** An adapter setup: analyzer options, plus the adapter options an experiment varies. */
export interface FaSetup {
  options: AnalyzerOptions;
  /** P1: Pagefind's hidden block. */
  pagefind?: { terms?: "all" | "new" | "prefix"; weight?: number; title?: "keep" | "fold" | "terms"; surface?: boolean };
  /** P3: Orama's sentinel (default on). */
  exactTerms?: boolean;
  /** P2: FlexSearch through the drop-in `faEncode` instead of `faDocument`. */
  flexDropIn?: boolean;
  /** P4: MiniSearch's combineWith. */
  combineWith?: "AND";
  /** Phase 3: query rescue (fa-search-kit/rescue); "replace": a suggestion replaces the search too (R11). */
  rescue?: boolean | "replace";
  /** R4: the engine's own typo tolerance (MiniSearch `fuzzy: 0.2`, Orama `tolerance: 1`, Lunr edit distance 1). */
  native?: boolean;
}

export interface Config {
  name: string;
  /** When set, the engine is set up through fa-search-kit's adapter (takes precedence over `analyzer`). */
  fa?: FaSetup;
  /**
   * When set (and `fa` is not), the engine indexes and searches pre-analyzed terms with its own
   * processing turned off. With `fa`, only compare.ts's engine-free coverage metric uses it.
   */
  analyzer?: Analyzer;
  /** For engines that match any query word (MiniSearch, Orama, Lunr), when it differs from `analyzer`. */
  anyWordAnalyzer?: Analyzer;
  tuned?: boolean;
  /** An experiment arm: run and reported only when named (`--config`). */
  experiment?: boolean;
  /** Only these engines (an arm that means nothing on the others). */
  engines?: string[];
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

/** A config set up through the adapters. `analyzer` is only for compare.ts's coverage metric. */
function adapter(name: string, options: AnalyzerOptions, setup: Omit<FaSetup, "options"> = {}, experiment = false): Config {
  return { ...fa(name, options, experiment), fa: { options, ...setup } };
}
const STANDARD: AnalyzerOptions = { profile: "standard" };
const FULL: AnalyzerOptions = { profile: "full", lexicon };

export const CONFIGS: Config[] = [
  { name: "stock" },
  { name: "tuned", tuned: true },
  { name: "snowball", analyzer: snowballAnalyzer },
  // The adapters pick the verb setting per engine (H10): lemmas where every query
  // word must match (Pagefind, FlexSearch), stems where any may (MiniSearch, Orama, Lunr).
  adapter("fa-light", { profile: "light" }),
  adapter("fa-standard", STANDARD),
  adapter("fa-full", FULL),
  // Phase 1's wiring, the Phase 2 baseline.
  fa("p1-light", { profile: "light" }),
  fa("p1-standard", STANDARD),
  { ...fa("p1-full", FULL), anyWordAnalyzer: fa("p1-full/any", { ...FULL, verbs: "stem" }).analyzer },
  // Phase 2 experiment arms (bench/results/experiments.md, "Phase 2"); each on its own engine.
  // P1 arms, with every layout option spelled out: the defaults moved to the winner (pf-surface).
  adapter("pf-all", STANDARD, { pagefind: { terms: "all", title: "keep", surface: false } }, true),
  adapter("pf-new", STANDARD, { pagefind: { terms: "new", title: "keep", surface: false } }, true),
  adapter("pf-weight2", STANDARD, { pagefind: { terms: "all", title: "keep", surface: false, weight: 2 } }, true),
  adapter("pf-title-fold", STANDARD, { pagefind: { terms: "all", title: "fold", surface: false } }, true),
  adapter("pf-title-terms", STANDARD, { pagefind: { terms: "all", title: "terms", surface: false } }, true),
  adapter("pf-new-fold", STANDARD, { pagefind: { terms: "new", title: "fold", surface: false } }, true),
  adapter("pf-surface", STANDARD, { pagefind: { terms: "new", title: "terms", surface: true } }, true),
  adapter("pf-all-surface", STANDARD, { pagefind: { terms: "all", title: "terms", surface: true } }, true),
  adapter("pf-prefix", STANDARD, { pagefind: { terms: "prefix", title: "terms", surface: true } }, true),
  adapter("flex-dropin", STANDARD, { flexDropIn: true }, true),
  adapter("flex-dropin-full", FULL, { flexDropIn: true }, true),
  adapter("orama-nosentinel", STANDARD, { exactTerms: false }, true),
  adapter("orama-nosentinel-full", FULL, { exactTerms: false }, true),
  adapter("orama-nosentinel-light", { profile: "light" }, { exactTerms: false }, true),
  adapter("ms-and-lemma", FULL, { combineWith: "AND" }, true),
  adapter("ms-and-stem", { ...FULL, verbs: "stem" }, { combineWith: "AND" }, true),
  // Phase 3: query rescue on fa-full, and the engine-native typo tolerance arms (R4). The
  // other arms (R1, R3, R5–R10) were removed with their options once decided
  // (bench/results/experiments.md, "Phase 3"); their runs stay in bench/data/runs.
  adapter("fa-rescue", FULL, { rescue: true }),
  // R11: every fix replaces the search (rescue before suggestions; its runs are the first fa-rescue runs).
  adapter("r11-replace", FULL, { rescue: "replace" }, true),
  { ...adapter("r4-native", FULL, { native: true }, true), engines: ["orama", "minisearch", "lunr"] },
  { ...adapter("r4-both", FULL, { rescue: true, native: true }, true), engines: ["orama", "minisearch", "lunr"] },
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
