/**
 * Write the Phase 3 query sets (bench/lib/rescue-sets.ts):
 *
 *     node bench/rescue-queries.ts     # bench/data/queries/<corpus>.rescue.jsonl
 *     node bench/run.ts --config fa-rescue --set rescue
 *     node bench/rescue-report.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CORPORA, loadCorpus } from "./corpus.ts";
import { RAW } from "./fetch.ts";
import { loadQueries, QUERY_DIR } from "./queries.ts";
import { buildSet, siteKeys } from "./lib/rescue-sets.ts";
import { splitOf } from "./lib/split.ts";
import { loadTreebank, TREEBANKS } from "./lib/ud.ts";
import { loadVocab } from "./vocab.ts";

const vocab = loadVocab();
const stop = new Set(readFileSync(new URL("hazm-stopwords.dat", RAW), "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
const names = new Set<string>();
for (const bank of TREEBANKS) for (const s of loadTreebank(bank)) for (const w of s.words) if (w.upos === "PROPN") names.add(w.form);

for (const corpus of CORPORA) {
  const docs = await loadCorpus(corpus);
  const set = buildSet({ corpus, site: siteKeys(docs), vocab, names, stop, queries: loadQueries(corpus), splitOf });
  writeFileSync(new URL(`${corpus}.rescue.jsonl`, QUERY_DIR), set.map((q) => JSON.stringify(q)).join("\n") + "\n");
  const counts = new Map<string, number>();
  for (const q of set) counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
  console.log(`${corpus}: ${set.length} queries; ${[...counts].map(([t, n]) => `${t} ${n}`).join(", ")}`);
}
