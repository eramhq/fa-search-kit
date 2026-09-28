/**
 * Run every query against every engine × config and record the target's rank.
 *
 *     node bench/run.ts                          # everything, in parallel child processes
 *     node bench/run.ts --corpus wiki --engine orama[,lunr] [--config stock,fa-standard] [--force]
 *     node bench/run.ts --config h8-keep --split dev     # experiment arms: dev queries only
 *     node bench/run.ts --config fa-rescue --set rescue  # an extra query set (bench/rescue-queries.ts)
 *
 * Each (corpus, engine, config) run is cached in bench/data/runs/ as one rank per
 * query (0 = not in the top 10), so a rerun only does what is missing. Then
 * `node bench/report.ts` turns the runs into the report.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CONFIGS } from "./configs.ts";
import { CORPORA, loadCorpus, type CorpusName } from "./corpus.ts";
import { ENGINES } from "./engines.ts";
import { createHash } from "node:crypto";
import { loadQueries, type Query } from "./queries.ts";
import { loadSet } from "./lib/rescue-sets.ts";
import { splitOf } from "./lib/split.ts";

export const RUN_DIR = new URL("data/runs/", import.meta.url);
/**
 * Runs over every query are `<corpus>.<engine>.<config>.json`; dev-only runs (experiment arms) add `.dev`;
 * runs over an extra query set add `.<set>`.
 */
export const runFile = (corpus: string, engine: string, config: string, split: "all" | "dev" = "all", set = "") =>
  new URL(`${corpus}.${engine}.${config}${set ? `.${set}` : ""}${split === "dev" ? ".dev" : ""}.json`, RUN_DIR);

export interface Run {
  corpus: string;
  engine: string;
  config: string;
  /** Query ids, in the same order as ranks. */
  ids: string[];
  /** Hash of every query's id and text: a regenerated query set with the same ids is still a different set. */
  queryHash?: string;
  /** 1-based rank of the target in the top 10, or 0. */
  ranks: number[];
  buildMs: number;
  searchMs: number;
  /**
   * Configs with query rescue, per query: the query searched instead ("" = as typed), the word
   * bytes it needed, the suggestion offered ("" = none) and the target's rank in its results.
   */
  fixed?: string[];
  bytes?: number[];
  suggested?: string[];
  suggestedRanks?: number[];
}

/** Hash of a query set (ids and texts). */
export const queryHash = (queries: Query[]) => createHash("sha256").update(queries.map((q) => `${q.id}\t${q.text}`).join("\n")).digest("hex").slice(0, 16);

/** A cached run counts only if it answered exactly the current query set (queries get regenerated). */
export function isCurrent(file: URL, queries: Query[]): boolean {
  const run = JSON.parse(readFileSync(file, "utf8")) as Run;
  return run.queryHash === queryHash(queries);
}

async function runOne(corpus: CorpusName, engineName: string, configs: string[], force: boolean, split: "all" | "dev", set: string) {
  const engine = ENGINES.find((e) => e.name === engineName);
  if (!engine) throw new Error(`unknown engine ${engineName}`);
  const docs = await loadCorpus(corpus);
  const queries = (set ? loadSet(corpus, set) : loadQueries(corpus)).filter((q) => split === "all" || splitOf(q.base) === "dev");
  for (const config of CONFIGS.filter((c) => configs.includes(c.name) && (!c.engines || c.engines.includes(engine.name)))) {
    const file = runFile(corpus, engine.name, config.name, split, set);
    if (existsSync(file) && !force && isCurrent(file, queries)) continue;
    const t0 = performance.now();
    const searcher = await engine.build(docs, config);
    const t1 = performance.now();
    const ranks: number[] = [], fixed: string[] = [], bytes: number[] = [], suggested: string[] = [], suggestedRanks: number[] = [];
    for (const q of queries) {
      const top = await searcher.search(q.text);
      ranks.push(top.indexOf(q.target) + 1);
      if (searcher.last) {
        fixed.push(searcher.last.fixed); bytes.push(searcher.last.bytes); suggested.push(searcher.last.suggested);
        suggestedRanks.push((searcher.last.suggestedTop ?? []).indexOf(q.target) + 1);
      }
    }
    const t2 = performance.now();
    await searcher.close?.();
    const run: Run = {
      corpus, engine: engine.name, config: config.name, ids: queries.map((q) => q.id), queryHash: queryHash(queries), ranks,
      buildMs: Math.round(t1 - t0), searchMs: Math.round(t2 - t1),
      ...(searcher.last ? { fixed, bytes, suggested, suggestedRanks } : {}),
    };
    writeFileSync(file, JSON.stringify(run));
    const found = ranks.filter((r) => r > 0).length;
    const fixes = searcher.last ? `, fixed ${(100 * fixed.filter(Boolean).length / ranks.length).toFixed(1)}%` : "";
    console.log(`${corpus}${set ? `/${set}` : ""} ${engine.name} ${config.name}${fixes}: build ${run.buildMs} ms, ${queries.length} queries in ${run.searchMs} ms, found ${(100 * found / ranks.length).toFixed(1)}%`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string" }, engine: { type: "string" }, config: { type: "string" },
      force: { type: "boolean", default: false }, jobs: { type: "string", default: "4" },
      split: { type: "string", default: "all" }, set: { type: "string", default: "" },
    },
  });
  mkdirSync(RUN_DIR, { recursive: true });
  // Default: the main configs. Tuned (Orama tuned alone takes 2.5 h) and experiment arms run only when named.
  const configs = values.config ? values.config.split(",") : CONFIGS.filter((c) => !c.tuned && !c.experiment).map((c) => c.name);
  if (values.split !== "all" && values.split !== "dev") throw new Error("--split is all or dev (test is only ever read from full runs)");
  if (values.corpus && values.engine && !`${values.corpus}${values.engine}`.includes(",")) await runOne(values.corpus as CorpusName, values.engine, configs, values.force, values.split, values.set);
  else await runAll(values);
}

async function runAll(values: { corpus?: string; engine?: string; config?: string; force: boolean; jobs: string; split: string; set: string }) {
  // Fan out one child process per (corpus, engine): isolates memory and the
  // Pagefind fetch shim, and uses the cores.
  const jobs = CORPORA.filter((c) => !values.corpus || values.corpus.split(",").includes(c))
    .flatMap((corpus) => ENGINES.filter((e) => !values.engine || values.engine.split(",").includes(e.name)).map((e) => [corpus, e.name] as const));
  const queue = [...jobs];
  let failed = 0;
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [corpus, engine] = job;
      const args = ["--max-old-space-size=6000", new URL(import.meta.url).pathname, "--corpus", corpus, "--engine", engine,
        ...(values.config ? ["--config", values.config] : []), ...(values.force ? ["--force"] : []), "--split", values.split, "--set", values.set];
      const code = await new Promise<number>((resolve) => spawn(process.execPath, args, { stdio: "inherit" }).on("exit", (c) => resolve(c ?? 1)));
      if (code !== 0) { failed++; console.error(`FAILED ${corpus} ${engine} (exit ${code})`); }
    }
  };
  await Promise.all(Array.from({ length: Number(values.jobs) }, worker));
  if (failed) process.exit(1);
}
