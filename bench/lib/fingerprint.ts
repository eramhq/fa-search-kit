/**
 * A fingerprint of every term a config gives the benchmark: each page's title and body
 * in index mode and each query in query mode, under both verb settings the adapters use
 * (lemma for Pagefind and FlexSearch, stem for the OR engines), plus the adapter setup.
 * Two runs of the same engine with the same fingerprint searched the same terms, so a
 * change that leaves it unchanged (a lexicon fix that touches no word of the corpus)
 * cannot change the results: bench/run.ts skips it. Engine and adapter code are not in
 * the fingerprint: after changing them, run with --force.
 */
import { createHash } from "node:crypto";
import { adapterAnalyzer } from "../../src/adapters/shared.ts";
import type { Config } from "../configs.ts";
import type { Doc } from "../corpus.ts";
import type { Query } from "../queries.ts";

type Analyze = (text: string, mode: "index" | "query") => string[];

export function termFingerprint(config: Config, docs: Doc[], queries: Query[]): string | undefined {
  const analyzers: Analyze[] = [];
  let setup = "";
  if (config.fa) {
    const { options, ...rest } = config.fa;
    const { lexicon: _, ...plain } = options;
    setup = JSON.stringify({ rest, plain });
    for (const verbs of ["lemma", "stem"] as const) {
      const a = adapterAnalyzer(options, verbs);
      analyzers.push((t, mode) => a.analyze(t, { mode }));
    }
  } else {
    for (const a of [config.analyzer, config.anyWordAnalyzer]) if (a) analyzers.push((t, mode) => a.analyze(t, mode));
  }
  if (!analyzers.length) return undefined; // stock and tuned configs: the engine's own processing
  const h = createHash("sha256").update(setup);
  for (const analyze of analyzers) {
    for (const d of docs) h.update(`${d.id}\t${analyze(d.title, "index").join(" ")}\t${analyze(d.body, "index").join(" ")}\n`);
    for (const q of queries) h.update(`${q.id}\t${analyze(q.text, "query").join(" ")}\n`);
  }
  return h.digest("hex").slice(0, 16);
}
