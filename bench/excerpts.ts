/**
 * P1's excerpt check: how often a Pagefind excerpt shows the adapter's hidden
 * block instead of the page's words, and what `processResult` makes of it.
 *
 *     node bench/excerpts.ts [--configs fa-standard,pf-new,pf-weight2] [--corpus products] [--sample 300]
 *
 * For a seeded sample of dev queries per corpus, every top-10 result's `data()`:
 * - block: Pagefind's excerpt overlaps a hidden block (⁅ … ⁆) in `content`;
 * - marked: Pagefind's excerpt marks a word outside the blocks;
 * - rebuilt marked: the excerpt from `processResult` marks a word (it never shows a block).
 * Writes bench/results/excerpts.md (numbers only; no text from the corpora).
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { faPagefind } from "../src/adapters/pagefind.ts";
import { faPagefindIndex } from "../src/adapters/pagefind-build.ts";
import { configByName } from "./configs.ts";
import { CORPORA, loadCorpus, type CorpusName } from "./corpus.ts";
import { buildPagefind } from "./lib/pagefind.ts";
import { rng, seedOf } from "./lib/rng.ts";
import { splitQueries } from "./lib/results.ts";

const { values } = parseArgs({
  options: { configs: { type: "string", default: "fa-standard,pf-new,pf-weight2" }, corpus: { type: "string" }, sample: { type: "string", default: "300" } },
});
const configs = values.configs.split(",").map(configByName);
const corpora = CORPORA.filter((c) => !values.corpus || c === values.corpus);
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const plain = (html: string) => html.replace(/<\/?mark>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]!);

interface Row { corpus: string; config: string; group: string; results: number; block: number; marked: number; rebuilt: number; notFound: number }
/** Typo and keyboard-layout variants are Phase 3's (query rescue): Pagefind drops or backs off their misspelled words. */
const groupOf = (type: string) => (/^(typo-|layout-|homophone)/.test(type) ? "typos, layouts" : "the rest");
const rows: Row[] = [];

for (const corpus of corpora) {
  const docs = await loadCorpus(corpus as CorpusName);
  const random = rng(seedOf(`excerpts/${corpus}`));
  const pool = splitQueries(corpus, "dev");
  const sample = Array.from({ length: Math.min(Number(values.sample), pool.length) }, () => pool[Math.floor(random() * pool.length)]!);
  for (const config of configs) {
    if (!config.fa) throw new Error(`${config.name}: not an adapter config`);
    const setup = config.fa;
    const pf = await buildPagefind(async (index) => {
      const pages = docs.map((d) => ({ url: `/d/${d.id}/`, content: `<!doctype html><html lang="fa"><body><h1>${escapeHtml(d.title)}</h1><p>${escapeHtml(d.body)}</p></body></html>` }));
      const errors = await faPagefindIndex({ ...setup.options, ...setup.pagefind }).addPages(index, pages);
      if (errors.length) throw new Error(errors.join("; "));
    });
    const fa = faPagefind(setup.options);
    const byGroup = new Map<string, Row>();
    for (const q of sample) {
      const group = groupOf(q.type);
      let row = byGroup.get(group);
      if (!row) byGroup.set(group, (row = { corpus, config: config.name, group, results: 0, block: 0, marked: 0, rebuilt: 0, notFound: 0 }));
      const res = await pf.search(fa.processQuery(q.text));
      for (const r of res.results.slice(0, 10)) {
        const data = await r.data();
        row.results++;
        const text = plain(data.excerpt);
        const hidden = [...data.content.matchAll(/⁅[^⁆]*⁆?/g)].map((m) => [m.index, m.index + m[0].length] as const);
        let at = data.content.indexOf(text);
        if (at < 0) at = data.content.indexOf(text.slice(0, 40));
        if (at < 0) row.notFound++;
        const end = at + text.length;
        const onBlock = /[⁅⁆]/.test(text) || (at >= 0 && hidden.some(([s, e]) => at < e && end > s));
        if (onBlock) row.block++;
        // A marked word outside the blocks: find each <mark> in the excerpt, map it to content.
        const marks = [...data.excerpt.matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => plain(m[1]!));
        const inBlock = (i: number) => hidden.some(([s, e]) => i >= s && i < e);
        if (at >= 0 && marks.some((m) => { const i = data.content.indexOf(m, at); return i >= 0 && !inBlock(i); })) row.marked++;
        if (/<mark>/.test(fa.processResult({ ...data }, q.text).excerpt)) row.rebuilt++;
      }
    }
    await pf.close();
    for (const row of [...byGroup.values()].sort((a, b) => (a.group < b.group ? 1 : -1))) {
      rows.push(row);
      const pct = (x: number) => `${((100 * x) / row.results).toFixed(1)}%`;
      console.log(`${corpus} ${config.name} (${row.group}): ${row.results} results; excerpt on block ${pct(row.block)}; marked page word ${pct(row.marked)}; rebuilt marked ${pct(row.rebuilt)}; excerpt not located ${row.notFound}`);
    }
  }
}

const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(1)}`;
const out = [
  "# Pagefind excerpts (P1)",
  "",
  `Generated by \`node bench/excerpts.ts --configs ${values.configs} --sample ${values.sample}\`: a seeded sample of dev queries per corpus, every top-10 result.`,
  "",
  "- **on block**: Pagefind's own excerpt overlaps a hidden block (the reader sees stems);",
  "- **marked page word**: Pagefind's excerpt highlights a word of the page's own text;",
  "- **rebuilt, marked**: after `processResult`, the excerpt highlights a page word (rebuilt excerpts never show a block).",
  "",
  "Query types are grouped: typo and keyboard-layout variants (Phase 3's), whose misspelled words Pagefind drops or backs off to a prefix, and the rest.",
  "",
  "| corpus | config | queries | results | on block % | marked page word % | rebuilt, marked % |",
  "|---|---|---|---:|---:|---:|---:|",
  ...rows.map((r) => `| ${r.corpus} | ${r.config} | ${r.group} | ${r.results} | ${pct(r.block, r.results)} | ${pct(r.marked, r.results)} | ${pct(r.rebuilt, r.results)} |`),
  "",
];
writeFileSync(new URL("results/excerpts.md", import.meta.url), out.join("\n"));
console.log("wrote bench/results/excerpts.md");
