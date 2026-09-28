/**
 * Write the Phase 4b lemma query set (bench/lib/lemma-sets.ts):
 *
 *     node bench/lemma-queries.ts     # bench/data/queries/<corpus>.lemma.jsonl
 *     node bench/run.ts --config fa-full,lm-tree --set lemma --split dev
 *     node bench/compare.ts fa-full lm-tree --set lemma
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CORPORA } from "./corpus.ts";
import { RAW } from "./fetch.ts";
import { loadQueries, QUERY_DIR } from "./queries.ts";
import { buildLemmaSet, udLexemes } from "./lib/lemma-sets.ts";
import { splitOf } from "./lib/split.ts";
import { loadVocab } from "./vocab.ts";

const vocab = loadVocab();
const stop = new Set(readFileSync(new URL("hazm-stopwords.dat", RAW), "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
const ud = udLexemes();
console.log(`UD: ${ud.lemmaOf.size} unambiguous forms of ${ud.forms.size} lemmas`);

for (const corpus of CORPORA) {
  const canonical = loadQueries(corpus).filter((q) => q.type === "canonical");
  const set = buildLemmaSet(corpus, canonical, ud, vocab, stop);
  writeFileSync(new URL(`${corpus}.lemma.jsonl`, QUERY_DIR), set.map((q) => JSON.stringify(q)).join("\n") + "\n");
  const counts = new Map<string, number>();
  for (const q of set) {
    const k = `${q.type} ${splitOf(q.base)}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sub = new Map<string, number>();
  for (const q of set) sub.set(`${q.type}: ${q.subtype}`, (sub.get(`${q.type}: ${q.subtype}`) ?? 0) + 1);
  console.log(`${corpus}: ${set.length} queries (${set.filter((q) => q.unseenUd).length} lemmas not in UD train); ${[...counts].sort().map(([t, n]) => `${t} ${n}`).join(", ")}`);
  console.log("  " + [...sub].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join("; "));
}
