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
 * - fa-full-p3 / fa-rescue-p3: fa-full and fa-rescue before Phase 4b added the lemma list
 *   to the lexicon (bench/results/phase4b.md); the arms of Phases 1–3 run on that lexicon.
 *   fa-full-4b / fa-rescue-4b: as Phase 4b shipped it, before its follow-up fixes. Both
 *   lexicons are snapshots (bench/lib/lexicons/), so these configs stay reproducible.
 * - lm-*: Phase 4b's lemma arms over the lexicon without its list (bench/results/experiments.md).
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
import { LEMMAS } from "../src/lexicon/lemmas.ts";
import * as P3 from "./lib/lexicons/p3.ts";
import * as P4B from "./lib/lexicons/p4b.ts";
import { CORPORA } from "./corpus.ts";
import { loadQueries } from "./queries.ts";
import { splitOf } from "./lib/split.ts";
import { rawTokens } from "./lib/persian.ts";
import { udOracle } from "./lib/lemma.ts";
import { createLemmaLexicon } from "../scripts/lemma/wrap.ts";
import { loadSaved, trainedWords } from "../scripts/lemma/saved.ts";
import { predictorOf } from "../scripts/lemma/model.ts";

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
/** The lexicon before Phase 4b's lemma list (Phase 3's fa-full); the earlier arms ran on it. */
const PLAIN = createLexicon(P3.VERBS, P3.KEEP, P3.PLURALS);
const FULL_P3: AnalyzerOptions = { profile: "full", lexicon: PLAIN };
/** The lexicon as Phase 4b shipped it, before the follow-up fixes. */
const FULL_4B: AnalyzerOptions = { profile: "full", lexicon: createLexicon(P4B.VERBS, P4B.KEEP, P4B.PLURALS, P4B.LEMMAS) };

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
  { ...fa("p1-full", FULL_P3), anyWordAnalyzer: fa("p1-full/any", { ...FULL_P3, verbs: "stem" }).analyzer },
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
  adapter("flex-dropin-full", FULL_P3, { flexDropIn: true }, true),
  adapter("orama-nosentinel", STANDARD, { exactTerms: false }, true),
  adapter("orama-nosentinel-full", FULL_P3, { exactTerms: false }, true),
  adapter("orama-nosentinel-light", { profile: "light" }, { exactTerms: false }, true),
  adapter("ms-and-lemma", FULL_P3, { combineWith: "AND" }, true),
  adapter("ms-and-stem", { ...FULL_P3, verbs: "stem" }, { combineWith: "AND" }, true),
  // Phase 3: query rescue on fa-full, and the engine-native typo tolerance arms (R4). The
  // other arms (R1, R3, R5–R10) were removed with their options once decided
  // (bench/results/experiments.md, "Phase 3"); their runs stay in bench/data/runs.
  adapter("fa-rescue", FULL, { rescue: true }),
  // R11: every fix replaces the search (rescue before suggestions; its runs are the first fa-rescue runs).
  adapter("r11-replace", FULL_P3, { rescue: "replace" }, true),
  { ...adapter("r4-native", FULL_P3, { native: true }, true), engines: ["orama", "minisearch", "lunr"] },
  { ...adapter("r4-both", FULL_P3, { rescue: true, native: true }, true), engines: ["orama", "minisearch", "lunr"] },
  // Phase 4b: fa-full with a lemma model behind the lexicon (scripts/lemma/wrap.ts;
  // bench/results/experiments.md, "Phase 4b"). lm-oracle-ud: gold UD targets for every
  // word UD lemmatizes one way (all UD files): the upper bound, never shipped.
  adapter("lm-oracle-ud", { profile: "full", get lexicon() { return (oracle ??= createLemmaLexicon(PLAIN, udOracle())); } }, {}, true),
  // The trained arms: bench/data/lemma/models/<name>.json (scripts/build-lemma.ts --train),
  // each at the confidence threshold saved with it.
  // The chosen list with query rescue, for the rescue guard (false fixes must not rise).
  { ...adapter("lm-list-rescue", { profile: "full", get lexicon() { const s = loadSaved("lm-list"); return (listRescue ??= createLemmaLexicon(PLAIN, predictorOf(s.model), s.tau)); } }, { rescue: true }, true) },
  // fa-full and fa-rescue as they were before Phase 4b (their runs: the old fa-full / fa-rescue runs).
  adapter("fa-full-p3", FULL_P3, {}, true),
  adapter("fa-full-4b", FULL_4B, {}, true),
  adapter("fa-rescue-4b", FULL_4B, { rescue: true }, true),
  adapter("fa-rescue-p3", FULL_P3, { rescue: true }, true),
  ...["lm-tree", "lm-linear", "lm-list", "lm-list-7", "lm-list-ez", "lm-list-ez-7", "lm-tree-mined", "lm-tree-ud", "lm-tree-hazm", "lm-tree-llm"].map((n) => lemmaArm(n)),
  // Kept for reference and the held-out diagnostic. The Phase 1 experiment arms (H1–H10)
  // are defined, with their exact options and bases, in bench/results/experiments.md;
  // they were removed from here when their options were decided (several options no
  // longer exist, and the profile defaults moved to the winners).
  fa("fa-full-lemma", { ...FULL_P3, verbs: "lemma" }, true),
  // fa-full as reported in phase1.md (joined «می» by lexicon only), before the rule fallback.
  { ...fa("fa-full-v1", { ...FULL_P3, joinedMi: "lexicon" }, true), anyWordAnalyzer: fa("fa-full-v1/any", { ...FULL_P3, joinedMi: "lexicon", verbs: "stem" }).analyzer },
  fa("fa-full-heldout", { profile: "full", get lexicon() { return heldOutLexicon(); } }, true),
  // Phase 4b: the dev verbs out of the lexicon, and out of the lemma model's training (lm-heldout-dev).
  adapter("fa-full-heldout-dev", { profile: "full", get lexicon() { return heldOutLexicon("dev"); } }, {}, true),
  lemmaArm("lm-heldout-dev", () => heldOutLexicon("dev")),
  // The light profile before H7's decision; its runs were fa-light's until then.
  fa("h7-light-none", { profile: "light", alefMadda: false }, true),
];

let oracle: ReturnType<typeof createLexicon> | undefined;
let listRescue: ReturnType<typeof createLexicon> | undefined;

/** A lemma-model arm: fa-full with the saved model behind the lexicon. `lemmaSeen` tells lemma-eval which words it trained on. */
function lemmaArm(name: string, base: () => ReturnType<typeof createLexicon> = () => PLAIN): Config & { lemmaSeen?: (w: string) => boolean } {
  let lex: ReturnType<typeof createLexicon> | undefined;
  let seen: Set<string> | undefined;
  const config = adapter(name, {
    profile: "full",
    get lexicon() {
      if (!lex) { const s = loadSaved(name); lex = createLemmaLexicon(base(), predictorOf(s.model), s.tau); }
      return lex;
    },
  }, {}, true);
  return { ...config, lemmaSeen: (w) => (seen ??= trainedWords(name)).has(w) };
}
const heldOut = new Map<string, ReturnType<typeof createLexicon>>();
/** The benchmark's verb lemmas of one split (past stems), which the held-out arms remove. */
export function heldOutVerbs(split: "dev" | "test"): Set<string> {
  const out = new Set<string>();
  for (const corpus of CORPORA) {
    for (const q of loadQueries(corpus)) if (q.lemma && splitOf(q.base) === split) out.add(q.lemma.split("#")[0]!.replace("+", ""));
  }
  return out;
}
function heldOutLexicon(split: "dev" | "test" = "test") {
  let lex = heldOut.get(split);
  if (!lex) {
    const out = heldOutVerbs(split);
    lex = createLexicon(VERBS.split(" ").filter((pair) => !out.has(pair.split("#")[0]!)).join(" "), KEEP, PLURALS, LEMMAS);
    heldOut.set(split, lex);
  }
  return lex;
}

export const configByName = (name: string) => {
  const c = CONFIGS.find((x) => x.name === name);
  if (!c) throw new Error(`unknown config ${name}; known: ${CONFIGS.map((x) => x.name).join(", ")}`);
  return c;
};
