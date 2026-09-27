/**
 * Pagefind in Node: build an index with the Node API, then load the generated
 * pagefind.js + WASM and search it, serving the bundle from disk through a fetch
 * shim. Used by the benchmark, the adapter tests and the excerpt check.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface PagefindResult {
  id: string;
  score: number;
  data(): Promise<{ url: string; excerpt: string; content: string; meta: Record<string, string> }>;
}
export interface LoadedPagefind {
  search(query: string): Promise<{ results: PagefindResult[] }>;
  /** pagefind.options(), e.g. `{ ranking: { pageLength: 0 } }`. */
  options(options: object): Promise<void>;
  close(): Promise<void>;
}
/** The Node API index, as far as the callers use it. */
export interface NodeIndex {
  addHTMLFile(file: { url?: string; sourcePath?: string; content: string }): Promise<{ errors: string[] }>;
}

/** Build an index (`fill` adds the pages), write it to a temp dir and load it for searching. */
export async function buildPagefind(fill: (index: NodeIndex) => Promise<void>, language = "fa"): Promise<LoadedPagefind> {
  const pagefind = await import("pagefind");
  const { index } = await pagefind.createIndex({ forceLanguage: language });
  if (!index) throw new Error("pagefind: createIndex failed");
  await fill(index);
  const dir = mkdtempSync(join(tmpdir(), "fa-search-pagefind-"));
  await index.writeFiles({ outputPath: dir });
  await pagefind.close();
  return loadPagefind(dir, true);
}

/** Load a written Pagefind bundle for searching in Node. `owned`: delete the dir on close. */
export async function loadPagefind(dir: string, owned = false): Promise<LoadedPagefind> {
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
  const pf = await import(`${join(dir, "pagefind.js")}?v=${Date.now()}${Math.random()}`);
  await pf.options({ basePath: origin, noWorker: true });
  await pf.init();
  return {
    search: (query) => pf.search(query),
    options: (options) => pf.options(options),
    async close() {
      globalThis.fetch = realFetch;
      if (owned) rmSync(dir, { recursive: true, force: true });
    },
  };
}
