/**
 * Build the three benchmark corpora from bench/data/raw into bench/data/corpus.
 *
 *     node bench/corpus.ts
 *
 * - wiki:     Persian Wikipedia articles (title + lead text). Encyclopedic prose.
 * - news:     pn-summary news articles. Titles are full sentences with verbs.
 * - products: Digikala product titles with category and brand. Short, noisy text.
 *
 * Text is kept exactly as published (Arabic ي/ك, missing half-spaces and all):
 * that mess is part of what the benchmark measures. Evaluation only; never bundled.
 */
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { RAW } from "./fetch.ts";
import { rng, shuffle } from "./lib/rng.ts";

export interface Doc {
  id: string;
  title: string;
  body: string;
}

export const CORPORA = ["wiki", "news", "products"] as const;
export type CorpusName = (typeof CORPORA)[number];
export const CORPUS_DIR = new URL("data/corpus/", import.meta.url);

const SIZE = 20_000;
const BODY_CHARS = 3000;
const SEED = 20260926;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

async function wiki(): Promise<Doc[]> {
  const file = await asyncBufferFromFile(new URL("wiki-fa-00000.parquet", RAW).pathname);
  const rows = (await parquetReadObjects({ file, columns: ["id", "title", "text"] })) as {
    id: string; title: string; text: string;
  }[];
  // Stubs (mostly bot-made village pages) are under 2,000 characters; lists and
  // disambiguation pages are not articles anyone searches for by name.
  const keep = rows.filter((r) =>
    r.text.length >= 2000 && !r.title.startsWith("فهرست") && !r.title.includes("ابهام\u200Cزدایی"));
  console.log(`wiki: ${rows.length} rows, ${keep.length} after filters`);
  return shuffle(rng(SEED), keep).slice(0, SIZE).map((r) => ({
    id: `w${r.id}`,
    title: squash(r.title),
    body: squash(r.text.slice(0, BODY_CHARS)),
  }));
}

async function news(): Promise<Doc[]> {
  const docs: Doc[] = [];
  const seen = new Set<string>();
  for (const split of ["train", "dev", "test"]) {
    const lines = createInterface({ input: createReadStream(new URL(`pn_summary/pn_summary/${split}.csv`, RAW)) });
    let header = true;
    for await (const line of lines) {
      if (header) { header = false; continue; }
      const f = line.split("\t");
      if (f.length !== 8) continue;
      const [id, title, article] = f as [string, string, string];
      const t = squash(title);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      docs.push({ id: `n${id.slice(0, 12)}`, title: t, body: squash(article.replaceAll("[n]", " ").slice(0, BODY_CHARS)) });
    }
  }
  console.log(`news: ${docs.length} unique titles`);
  return shuffle(rng(SEED), docs).slice(0, SIZE);
}

// Share of the sample per Digikala sub_category. The dump is 46% clothing;
// flattening it keeps books, beauty, toys and food from being drowned out.
const PRODUCT_QUOTA: Record<string, number> = {
  "clothe": 0.25, "book & stationary & art": 0.25, "beauty": 0.2,
  "toys and kids": 0.15, "rural goods": 0.1, "travel": 0.05,
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function products(): Promise<Doc[]> {
  const byCategory = new Map<string, Doc[]>();
  const seen = new Set<string>();
  const lines = createInterface({ input: createReadStream(new URL("digikala-products.csv", RAW)) });
  let header = true;
  for await (const line of lines) {
    if (header) { header = false; continue; }
    const f = parseCsvLine(line);
    if (f.length !== 12) continue;
    const [id, title, , , cat1, cat2, brand, , , , , sub] = f as string[];
    const t = squash(title!);
    if (t.length < 8 || seen.has(t)) continue;
    seen.add(t);
    const body = [cat1, cat2, brand === "متفرقه" ? "" : brand].map((s) => squash(s ?? "")).filter(Boolean).join(" ");
    const list = byCategory.get(sub!) ?? [];
    list.push({ id: `p${id}`, title: t, body });
    byCategory.set(sub!, list);
  }
  const random = rng(SEED);
  const docs: Doc[] = [];
  for (const [sub, share] of Object.entries(PRODUCT_QUOTA)) {
    const pool = byCategory.get(sub) ?? [];
    docs.push(...shuffle(random, pool).slice(0, Math.round(SIZE * share)));
    console.log(`products: ${sub}: ${pool.length} unique titles`);
  }
  return shuffle(random, docs);
}

export async function loadCorpus(name: CorpusName): Promise<Doc[]> {
  const { readFileSync } = await import("node:fs");
  return readFileSync(new URL(`${name}.jsonl`, CORPUS_DIR), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Doc);
}

if (import.meta.main) {
  mkdirSync(CORPUS_DIR, { recursive: true });
  const builders: Record<CorpusName, () => Promise<Doc[]>> = { wiki, news, products };
  for (const name of CORPORA) {
    const docs = await builders[name]();
    writeFileSync(new URL(`${name}.jsonl`, CORPUS_DIR), docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
    console.log(`wrote ${name}.jsonl: ${docs.length} docs`);
  }
}
