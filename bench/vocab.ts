/**
 * Count raw tokens across all raw sources (full wiki shard, all news, all
 * product titles), keeping tokens seen at least MIN_COUNT times.
 *
 *     node bench/vocab.ts
 *
 * The query generator uses this as an attestation list: an inflected form it
 * invents (a plural, a clitic, another verb tense) is used only if real people
 * wrote it, so the benchmark never tests non-words.
 */
import { asyncBufferFromFile, parquetRead } from "hyparquet";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { RAW } from "./fetch.ts";
import { rawTokens } from "./lib/persian.ts";

const MIN_COUNT = 3;
export const VOCAB_FILE = new URL("data/vocab.tsv", import.meta.url);

export function loadVocab(): Map<string, number> {
  const vocab = new Map<string, number>();
  for (const line of readFileSync(VOCAB_FILE, "utf8").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab > 0) vocab.set(line.slice(0, tab), Number(line.slice(tab + 1)));
  }
  return vocab;
}

if (import.meta.main) {
  const counts = new Map<string, number>();
  const add = (text: string) => {
    for (const t of rawTokens(text)) counts.set(t, (counts.get(t) ?? 0) + 1);
  };

  const file = await asyncBufferFromFile(new URL("wiki-fa-00000.parquet", RAW).pathname);
  await parquetRead({
    file, columns: ["title", "text"], rowFormat: "object",
    onComplete: (rows) => { for (const r of rows as { title: string; text: string }[]) { add(r.title); add(r.text); } },
  });
  console.log(`wiki: ${counts.size} types`);

  for (const split of ["train", "dev", "test"]) {
    const lines = createInterface({ input: createReadStream(new URL(`pn_summary/pn_summary/${split}.csv`, RAW)) });
    for await (const line of lines) {
      const f = line.split("\t");
      if (f.length === 8) { add(f[1]!); add(f[2]!.replaceAll("[n]", " ")); }
    }
  }
  console.log(`+news: ${counts.size} types`);

  const lines = createInterface({ input: createReadStream(new URL("digikala-products.csv", RAW)) });
  for await (const line of lines) add(line.split(",", 2)[1] ?? "");
  console.log(`+products: ${counts.size} types`);

  const kept = [...counts].filter(([, n]) => n >= MIN_COUNT).sort((a, b) => b[1] - a[1]);
  writeFileSync(VOCAB_FILE, kept.map(([t, n]) => `${t}\t${n}`).join("\n") + "\n");
  console.log(`wrote vocab.tsv: ${kept.length} types with count >= ${MIN_COUNT}`);
}
