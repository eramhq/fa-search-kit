/**
 * Run every query against every engine × config and record the target's rank.
 *
 *     node bench/run.ts                          # everything, in parallel child processes
 *     node bench/run.ts --corpus wiki --engine orama [--config stock] [--force]
 *
 * Each (corpus, engine, config) run is cached in bench/data/runs/ as one rank per
 * query (0 = not in the top 10), so a rerun only does what is missing. Then
 * `node bench/report.ts` turns the runs into the report.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CONFIGS } from "./configs.ts";
import { CORPORA, loadCorpus, type CorpusName } from "./corpus.ts";
import { ENGINES } from "./engines.ts";
import { loadQueries } from "./queries.ts";

export const RUN_DIR = new URL("data/runs/", import.meta.url);
export const runFile = (corpus: string, engine: string, config: string) =>
  new URL(`${corpus}.${engine}.${config}.json`, RUN_DIR);

export interface Run {
  corpus: string;
  engine: string;
  config: string;
  /** Query ids, in the same order as ranks. */
  ids: string[];
  /** 1-based rank of the target in the top 10, or 0. */
  ranks: number[];
  buildMs: number;
  searchMs: number;
}

async function runOne(corpus: CorpusName, engineName: string, configs: string[], force: boolean) {
  const engine = ENGINES.find((e) => e.name === engineName);
  if (!engine) throw new Error(`unknown engine ${engineName}`);
  const docs = await loadCorpus(corpus);
  const queries = loadQueries(corpus);
  for (const config of CONFIGS.filter((c) => configs.includes(c.name))) {
    const file = runFile(corpus, engine.name, config.name);
    if (existsSync(file) && !force) continue;
    const t0 = performance.now();
    const searcher = await engine.build(docs, config);
    const t1 = performance.now();
    const ranks: number[] = [];
    for (const q of queries) {
      const top = await searcher.search(q.text);
      ranks.push(top.indexOf(q.target) + 1);
    }
    const t2 = performance.now();
    await searcher.close?.();
    const run: Run = {
      corpus, engine: engine.name, config: config.name, ids: queries.map((q) => q.id), ranks,
      buildMs: Math.round(t1 - t0), searchMs: Math.round(t2 - t1),
    };
    writeFileSync(file, JSON.stringify(run));
    const found = ranks.filter((r) => r > 0).length;
    console.log(`${corpus} ${engine.name} ${config.name}: build ${run.buildMs} ms, ${queries.length} queries in ${run.searchMs} ms, found ${(100 * found / ranks.length).toFixed(1)}%`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string" }, engine: { type: "string" }, config: { type: "string" },
      force: { type: "boolean", default: false }, jobs: { type: "string", default: "4" },
    },
  });
  mkdirSync(RUN_DIR, { recursive: true });
  const configs = values.config ? [values.config] : CONFIGS.map((c) => c.name);
  if (values.corpus && values.engine) await runOne(values.corpus as CorpusName, values.engine, configs, values.force);
  else await runAll(values);
}

async function runAll(values: { corpus?: string; engine?: string; config?: string; force: boolean; jobs: string }) {
  // Fan out one child process per (corpus, engine): isolates memory and the
  // Pagefind fetch shim, and uses the cores.
  const jobs = CORPORA.filter((c) => !values.corpus || c === values.corpus)
    .flatMap((corpus) => ENGINES.filter((e) => !values.engine || e.name === values.engine).map((e) => [corpus, e.name] as const));
  const queue = [...jobs];
  let failed = 0;
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [corpus, engine] = job;
      const args = ["--max-old-space-size=6000", new URL(import.meta.url).pathname, "--corpus", corpus, "--engine", engine,
        ...(values.config ? ["--config", values.config] : []), ...(values.force ? ["--force"] : [])];
      const code = await new Promise<number>((resolve) => spawn(process.execPath, args, { stdio: "inherit" }).on("exit", (c) => resolve(c ?? 1)));
      if (code !== 0) { failed++; console.error(`FAILED ${corpus} ${engine} (exit ${code})`); }
    }
  };
  await Promise.all(Array.from({ length: Number(values.jobs) }, worker));
  if (failed) process.exit(1);
}
