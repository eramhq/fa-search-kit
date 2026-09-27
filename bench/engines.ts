/**
 * One adapter per engine: build an index over the corpus under a config, then
 * answer queries with the top-10 doc ids.
 *
 * With an analyzer, docs and queries are passed through it first and the engine
 * only splits on whitespace, so the engine's own (English-oriented) processing
 * cannot interfere. That is equivalent to a proper tokenizer/processTerm hook,
 * which the Phase 2 adapters will provide.
 */
import { create, insertMultiple, search as oramaSearch, type AnyOrama } from "@orama/orama";
import FlexSearch from "flexsearch";
import lunr from "lunr";
import MiniSearch from "minisearch";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "./configs.ts";
import type { Doc } from "./corpus.ts";

export const TOP_K = 10;

export interface Searcher {
  search(query: string): Promise<string[]>;
  close?(): Promise<void>;
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

const minisearch: Engine = {
  name: "minisearch",
  async build(docs, config) {
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
 * components/index.js and trees/radix.js of 3.1.18). `exact: true` cannot switch it off
 * for Persian: it post-filters with a JS `\b` regex, which never matches between
 * Persian letters. `orama-exact` ends every analyzed term with a sentinel, so a term
 * is only a prefix of itself: what a Phase 2 adapter could do. Analyzer configs only.
 */
const SENTINEL = "_";
function oramaEngine(name: string, exactTerms: boolean): Engine {
  return {
    name,
    async build(docs, config) {
      const tokenizer = config.analyzer
        ? { language: "english", normalizationCache: new Map(), tokenize: whitespace }
        : config.tuned ? { language: "arabic" } : undefined;
      const db: AnyOrama = create({
        schema: { title: "string", body: "string" } as const,
        ...(tokenizer ? { components: { tokenizer: tokenizer as never } } : {}),
      });
      const mark = (text: string) => (exactTerms && config.analyzer ? text.split(" ").filter(Boolean).map((t) => t + SENTINEL).join(" ") : text);
      await insertMultiple(db, prepare(docs, config, true).map((d) => ({ ...d, title: mark(d.title), body: mark(d.body) })), 5000);
      return {
        async search(q) {
          const res = await oramaSearch(db, {
            term: mark(prepareQuery(q, config, true)), properties: ["title", "body"], boost: { title: 2 }, limit: TOP_K,
            ...(config.tuned ? { tolerance: 1 } : {}),
          });
          return res.hits.map((h) => String(h.id));
        },
      };
    },
  };
}
const orama = oramaEngine("orama", false);
const oramaExact = oramaEngine("orama-exact", true);

const flexsearch: Engine = {
  name: "flexsearch",
  async build(docs, config) {
    const { Document, Encoder } = FlexSearch;
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
 * in Node, serving the bundle from disk through a fetch shim.
 */
const pagefindEngine: Engine = {
  name: "pagefind",
  async build(docs, config) {
    const pagefind = await import("pagefind");
    const lang = config.tuned ? "ar" : "fa";
    const { index } = await pagefind.createIndex({ forceLanguage: lang });
    if (!index) throw new Error("pagefind: createIndex failed");
    for (const d of prepare(docs, config)) {
      const html = `<!doctype html><html lang="${lang}"><body><h1>${escapeHtml(d.title)}</h1><p>${escapeHtml(d.body)}</p></body></html>`;
      const r = await index.addHTMLFile({ url: `/d/${d.id}/`, content: html });
      if (r.errors.length) throw new Error(`pagefind: ${r.errors.join("; ")}`);
    }
    const dir = mkdtempSync(join(tmpdir(), "fa-search-pagefind-"));
    await index.writeFiles({ outputPath: dir });
    await pagefind.close();

    const origin = `http://pagefind.bench/${encodeURIComponent(dir)}/`;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(origin)) return realFetch(input, init);
      const path = url.slice(origin.length).split("?")[0]!;
      return new Response(await readFile(join(dir, path)));
    }) as typeof fetch;
    (globalThis as { location?: unknown }).location ??= new URL("http://pagefind.bench/");

    // A fresh module instance per index: the query string busts Node's import cache.
    const pf = await import(`${join(dir, "pagefind.js")}?v=${Date.now()}`);
    await pf.options({ basePath: origin, noWorker: true });
    await pf.init();
    const urls = new Map<string, string>();
    return {
      async search(q) {
        const res = await pf.search(prepareQuery(q, config));
        const top = res.results.slice(0, TOP_K) as { id: string; data(): Promise<{ url: string }> }[];
        return Promise.all(top.map(async (r) => {
          let url = urls.get(r.id);
          if (!url) { url = (await r.data()).url; urls.set(r.id, url); }
          return url.split("/").at(-2)!;
        }));
      },
      async close() {
        globalThis.fetch = realFetch;
        rmSync(dir, { recursive: true, force: true });
      },
    };
  },
};

export const ENGINES: Engine[] = [pagefindEngine, orama, minisearch, flexsearch, lunrEngine, oramaExact];
