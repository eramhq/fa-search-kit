/**
 * One wrapper per engine: build an index over the corpus under a config, then
 * answer queries with the top-10 doc ids.
 *
 * - A config with `fa` sets the engine up through fa-search-kit's shipped adapter
 *   (src/adapters/), exactly as a site would.
 * - A config with only `analyzer` (snowball, Phase 1's p1-*) passes docs and
 *   queries through it first and has the engine split on whitespace, with its own
 *   (English-oriented) processing off.
 * - Otherwise the engine's own defaults (stock, tuned).
 *
 * With `fa.rescue` the search goes through fa-search-kit/rescue: `rescueSearch` around
 * the engine's search, terms and words collected with `addText` (Pagefind: the word
 * list built while annotating, known words probed with the index itself). The searcher
 * reports each query's fix and the bytes of word pieces it needed.
 */
import { create, insertMultiple, search as oramaSearch, type AnyOrama } from "@orama/orama";
import FlexSearch from "flexsearch";
import lunr from "lunr";
import MiniSearch from "minisearch";
import { createRequire } from "node:module";
import { faDocument, faEncode } from "../src/adapters/flexsearch.ts";
import { faLunr } from "../src/adapters/lunr.ts";
import { faMiniSearch } from "../src/adapters/minisearch.ts";
import { faTokenizer } from "../src/adapters/orama.ts";
import { faPagefind } from "../src/adapters/pagefind.ts";
import { faPagefindIndex } from "../src/adapters/pagefind-build.ts";
import { pagefindKnows } from "../src/adapters/pagefind-rescue.ts";
import { adapterAnalyzer, queryTerms } from "../src/adapters/shared.ts";
import type { Analyzer as FaAnalyzer } from "../src/analyzer.ts";
import { createWordList } from "../src/rescue/build.ts";
import { createRescue, fetchWords, type Rescue } from "../src/rescue/index.ts";
import type { Config } from "./configs.ts";
import type { Doc } from "./corpus.ts";
import { buildPagefind } from "./lib/pagefind.ts";

export const TOP_K = 10;

export interface Searcher {
  search(query: string): Promise<string[]>;
  close?(): Promise<void>;
  /**
   * With rescue, the last search: the query searched instead ("" when as typed), the
   * suggestion offered ("" when none) and its top results, and the word bytes a fix needed.
   */
  last?: { fixed: string; bytes: number; suggested: string; suggestedTop?: string[] };
}

export interface Engine {
  name: string;
  build(docs: Doc[], config: Config): Promise<Searcher>;
}

/** The analyzer for this engine: any-word engines may get their own (H10). */
const analyzerOf = (config: Config, anyWord: boolean) => (anyWord && config.anyWordAnalyzer) || config.analyzer;

/** Apply the config's analyzer to a doc (or return it unchanged), in index mode. */
function prepare(docs: Doc[], config: Config, anyWord = false): Doc[] {
  const a = analyzerOf(config, anyWord);
  return a ? docs.map((d) => ({ id: d.id, title: a.analyze(d.title, "index").join(" "), body: a.analyze(d.body, "index").join(" ") })) : docs;
}
/** Query mode: one term per token, because Pagefind and FlexSearch require every query word to match. */
const prepareQuery = (q: string, config: Config, anyWord = false) => {
  const a = analyzerOf(config, anyWord);
  return a ? a.analyze(q, "query").join(" ") : q;
};
const whitespace = (text: string) => text.split(" ").filter(Boolean);

/**
 * The analyzer a rescue config shares between the adapter and the rescue (the adapter's
 * own default for this engine's verbs), or undefined: the adapter builds its own.
 */
function sharedAnalyzer(config: Config, verbs: "lemma" | "stem"): FaAnalyzer | undefined {
  const fa = config.fa;
  if (!fa?.rescue && !fa?.native) return undefined;
  return adapterAnalyzer(fa.options, verbs);
}

/** A rescue as a site sets one up for an in-browser engine: terms and words from each doc. */
const replaces = (config: Config) => config.fa?.rescue === "replace";

function browserRescue(config: Config, analyzer: FaAnalyzer | undefined, docs: Doc[]): Rescue | undefined {
  if (!config.fa?.rescue || !analyzer) return undefined;
  const rescue = createRescue({ analyzer });
  for (const d of docs) rescue.addText(`${d.title} ${d.body}`);
  return rescue;
}

/**
 * `search` through the rescue when there is one; records what was searched instead, the
 * suggestion offered (and its top results, for "one click away"), and the word bytes a fix
 * needed. `replace` (arm R11): a suggestion replaces the search too, as rescue did before
 * suggestions.
 */
function rescued(search: (q: string) => Promise<string[]>, rescue?: Rescue, sizes?: Map<string, number>, replace = false): Searcher {
  if (!rescue) return { search };
  const searcher: Searcher = {
    last: { fixed: "", bytes: 0, suggested: "" },
    async search(q) {
      const r = await rescue.rescueSearch(search, q);
      const fix = r.fix;
      const suggestion = fix && !fix.auto ? await search(fix.to) : undefined;
      const applied = fix && (fix.auto || replace) ? fix.to : "";
      // A cold visitor's weak search downloads the list's manifest and the pieces it needs.
      const pieces = fix?.pieces ?? [];
      searcher.last = {
        fixed: applied, suggested: fix && !applied ? fix.to : "", suggestedTop: applied ? undefined : suggestion,
        bytes: pieces.length ? pieces.reduce((n, k) => n + (sizes?.get(k) ?? 0), sizes?.get("index.json") ?? 0) : 0,
      };
      return replace && suggestion ? suggestion : r.results;
    },
  };
  return searcher;
}

const minisearch: Engine = {
  name: "minisearch",
  async build(docs, config) {
    if (config.fa) {
      const analyzer = sharedAnalyzer(config, config.fa.combineWith === "AND" ? "lemma" : "stem");
      const fa = faMiniSearch({ ...config.fa.options, analyzer, combineWith: config.fa.combineWith });
      const ms = new MiniSearch<Doc>({ fields: ["title", "body"], idField: "id", ...fa });
      ms.addAll(docs);
      const searchOptions = { ...fa.searchOptions, boost: { title: 2 }, ...(config.fa.native ? { fuzzy: 0.2 } : {}) };
      return rescued(async (q) => ms.search(q, searchOptions).slice(0, TOP_K).map((r) => String(r.id)), browserRescue(config, analyzer, docs), undefined, replaces(config));
    }
    const options = config.analyzer
      ? { tokenize: whitespace, processTerm: (t: string) => t }
      : {};
    const ms = new MiniSearch<Doc>({ fields: ["title", "body"], idField: "id", ...options });
    ms.addAll(prepare(docs, config, true));
    const searchOptions = { boost: { title: 2 }, ...(config.tuned ? { fuzzy: 0.2, prefix: true } : {}) };
    return {
      async search(q) {
        return ms.search(prepareQuery(q, config, true), searchOptions).slice(0, TOP_K).map((r) => String(r.id));
      },
    };
  },
};

/**
 * Orama looks each query term up as a prefix in its radix tree and sums the scores
 * of every indexed word it prefixes (`exact: false`, the default; verified in
 * components/index.js and trees/radix.js of 3.1.18). The adapter ends every term
 * with a sentinel so a term is only a prefix of itself (`exactTerms`, P3). Phase 1's
 * wiring (p1-*) has no sentinel; Phase 1 emulated it in an `orama-exact` engine,
 * dropped now that the adapter does it (its runs stay in bench/data/runs).
 */
const orama: Engine = {
  name: "orama",
  async build(docs, config) {
    const analyzer = sharedAnalyzer(config, "stem");
    const tokenizer = config.fa ? faTokenizer({ ...config.fa.options, analyzer, exactTerms: config.fa.exactTerms })
      : config.analyzer ? { language: "english", normalizationCache: new Map(), tokenize: whitespace }
      : config.tuned ? { language: "arabic" } : undefined;
    const db: AnyOrama = create({
      schema: { title: "string", body: "string" } as const,
      ...(tokenizer ? { components: { tokenizer: tokenizer as never } } : {}),
    });
    const raw = !!config.fa;
    await insertMultiple(db, raw ? docs : prepare(docs, config, true), 5000);
    return rescued(async (q) => {
      const res = await oramaSearch(db, {
        term: raw ? q : prepareQuery(q, config, true), properties: ["title", "body"], boost: { title: 2 }, limit: TOP_K,
        ...(config.tuned || config.fa?.native ? { tolerance: 1 } : {}),
      });
      return res.hits.map((h) => String(h.id));
    }, browserRescue(config, analyzer, docs), undefined, replaces(config));
  },
};

const flexsearch: Engine = {
  name: "flexsearch",
  async build(docs, config) {
    const { Document, Encoder } = FlexSearch;
    if (config.fa) {
      const document = { document: { id: "id", index: ["title", "body"] } };
      const analyzer = sharedAnalyzer(config, "lemma");
      const options = { ...config.fa.options, analyzer };
      const index = config.fa.flexDropIn
        ? new Document({ ...document, encode: faEncode(options) } as never)
        : faDocument(FlexSearch, document, options);
      for (const d of docs) index.add(d as never);
      // FlexSearch has no edit-distance typo tolerance (R4 does not apply).
      return rescued(async (q) => {
        const res = index.search(q, { limit: TOP_K, merge: true } as never) as unknown as { id: string }[];
        return res.slice(0, TOP_K).map((r) => String(r.id));
      }, browserRescue(config, analyzer, docs), undefined, replaces(config));
    }
    const options: Record<string, unknown> = {};
    if (config.analyzer) options.encoder = new Encoder({ normalize: false, dedupe: false, split: /\s+/, numeric: false });
    if (config.tuned) options.tokenize = "forward";
    const index = new Document({ document: { id: "id", index: ["title", "body"] }, ...options } as never);
    for (const d of prepare(docs, config)) index.add(d as never);
    return {
      async search(q) {
        const opts = { limit: TOP_K, merge: true, ...(config.tuned ? { suggest: true } : {}) };
        const res = index.search(prepareQuery(q, config), opts as never) as unknown as { id: string }[];
        return res.slice(0, TOP_K).map((r) => String(r.id));
      },
    };
  },
};

const require = createRequire(import.meta.url);
let lunrArLoaded = false;

/** Lunr's query syntax treats these as operators; a search box user types them as text. */
const escapeLunr = (q: string) => q.replace(/[:~^+\-*\\]/g, "\\$&");

const lunrEngine: Engine = {
  name: "lunr",
  async build(docs, config) {
    if (config.fa) {
      const analyzer = sharedAnalyzer(config, "stem");
      const fa = faLunr(lunr, { ...config.fa.options, analyzer });
      const idx = lunr(function () {
        this.use(fa);
        this.ref("id");
        this.field("title", { boost: 2 });
        this.field("body");
        for (const d of docs) this.add(d);
      });
      // R4: fa.search has no edit-distance option; the same query with Lunr's own editDistance.
      const fuzzy = (q: string) => {
        const terms = queryTerms(analyzer!, q);
        return terms.length ? idx.query((x) => { for (const t of terms) x.term(t, { usePipeline: false, editDistance: 1 }); }) : [];
      };
      return rescued(async (q) => (config.fa!.native ? fuzzy(q) : fa.search(idx, q)).slice(0, TOP_K).map((r) => r.ref), browserRescue(config, analyzer, docs), undefined, replaces(config));
    }
    if (config.tuned && !lunrArLoaded) {
      require("lunr-languages/lunr.stemmer.support")(lunr);
      require("lunr-languages/lunr.ar")(lunr);
      lunrArLoaded = true;
    }
    const prepared = prepare(docs, config, true);
    const idx = lunr(function () {
      if (config.tuned) this.use((lunr as unknown as { ar: lunr.Builder.Plugin }).ar);
      if (config.analyzer) { this.pipeline.reset(); this.searchPipeline.reset(); }
      this.ref("id");
      this.field("title", { boost: 2 });
      this.field("body");
      for (const d of prepared) this.add(d);
    });
    return {
      async search(q) {
        const text = escapeLunr(prepareQuery(q, config, true)).trim();
        if (!text) return [];
        try {
          return idx.search(text).slice(0, TOP_K).map((r) => r.ref);
        } catch {
          return []; // a query Lunr cannot parse finds nothing for the user either
        }
      },
    };
  },
};

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Pagefind: index with the Node API, then run the real pagefind.js + WASM search
 * in Node (bench/lib/pagefind.ts). With `fa`: pages annotated by the adapter
 * (original text + hidden terms), queries through `processQuery`.
 */
const pagefindEngine: Engine = {
  name: "pagefind",
  async build(docs, config) {
    const lang = config.tuned ? "ar" : "fa";
    const html = (d: Doc) => `<!doctype html><html lang="${lang}"><body><h1>${escapeHtml(d.title)}</h1><p>${escapeHtml(d.body)}</p></body></html>`;
    const fa = config.fa;
    const analyzer = sharedAnalyzer(config, "lemma");
    const words = fa?.rescue ? createWordList() : undefined;
    const pf = await buildPagefind(async (index) => {
      if (fa) {
        const errors = await faPagefindIndex({ ...fa.options, ...fa.pagefind, analyzer, words }).addPages(index, docs.map((d) => ({ url: `/d/${d.id}/`, content: html(d) })));
        if (errors.length) throw new Error(`pagefind: ${errors.join("; ")}`);
        return;
      }
      for (const d of prepare(docs, config)) {
        const r = await index.addHTMLFile({ url: `/d/${d.id}/`, content: html(d) });
        if (r.errors.length) throw new Error(`pagefind: ${r.errors.join("; ")}`);
      }
    }, lang);
    const query = fa ? faPagefind({ ...fa.options, analyzer }).processQuery : (q: string) => prepareQuery(q, config);
    const urls = new Map<string, string>();
    let rescue: Rescue | undefined, sizes: Map<string, number> | undefined;
    if (fa?.rescue && words) {
      // As a site: the built list fetched piece by piece (here from memory), known words probed with the index.
      const files = words.files();
      sizes = new Map([...files].map(([name, data]) => [name.split(".").slice(0, 2).join("."), data.length]));
      const source = fetchWords("http://words.bench/", async (url) => new Response(files.get(String(url).split("/").pop()!) as Uint8Array<ArrayBuffer>));
      const knows = pagefindKnows({ search: (q) => pf.search(q) }, faPagefind({ ...fa.options, analyzer }));
      rescue = createRescue({ analyzer: analyzer!, words: source, isKnown: knows });
    }
    const searcher = rescued(async (q) => {
      const res = await pf.search(query(q));
      const top = res.results.slice(0, TOP_K);
      return Promise.all(top.map(async (r) => {
        let url = urls.get(r.id);
        if (!url) { url = (await r.data()).url; urls.set(r.id, url); }
        return url.split("/").at(-2)!;
      }));
    }, rescue, sizes, replaces(config));
    return { ...searcher, search: (q) => searcher.search(q), get last() { return searcher.last; }, close: () => pf.close() };
  },
};

export const ENGINES: Engine[] = [pagefindEngine, orama, minisearch, flexsearch, lunrEngine];
