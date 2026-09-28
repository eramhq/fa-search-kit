/**
 * The demo's replay panel, headless: every replay query against both built
 * indexes (the same pagefind.js + WASM a browser loads), found = target in the
 * top 10. The fa side searches with query rescue, as the demo's box does (word list
 * from demo/dist/fa-words, known words probed with the index), and reports the word
 * bytes a cold visitor's weak search downloads. Also checks that, after
 * `processResult`, fa-search-kit's excerpts never show the hidden block and every
 * result shows the page's own title.
 *
 *     node demo/build.ts && node demo/check.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { faPagefind } from "../src/adapters/pagefind.ts";
import { pagefindKnows } from "../src/adapters/pagefind-rescue.ts";
import { adapterAnalyzer } from "../src/adapters/shared.ts";
import { lexicon } from "../src/lexicon/index.ts";
import { createRescue, fetchWords } from "../src/rescue/index.ts";
import { loadPagefind, type LoadedPagefind } from "../bench/lib/pagefind.ts";

const DIST = new URL("dist/", import.meta.url);
const replay = JSON.parse(readFileSync(new URL("replay.json", DIST), "utf8")) as { type: string; text: string; url: string }[];
const analyzer = adapterAnalyzer({ profile: "full", lexicon }, "lemma");
const fa = faPagefind({ analyzer });
const WORDS = new URL("fa-words/", DIST);
const sizes = new Map(readdirSync(WORDS).map((f) => [f.split(".").slice(0, 2).join("."), statSync(new URL(f, WORDS)).size]));

async function top(pf: LoadedPagefind, q: string) {
  const res = await pf.search(q);
  return Promise.all(res.results.slice(0, 10).map((r) => r.data()));
}

// One index at a time: the loader swaps a global fetch shim.
const found = new Map<string, { n: number; stock: number; fa: number; fixed: number }>();
let excerpts = 0, soup = 0, marked = 0, titles = 0;
const weakBytes: number[] = [];
for (const name of ["stock", "fa"] as const) {
  const pf = await loadPagefind(new URL(`pagefind-${name}`, DIST).pathname);
  const rescue = createRescue({
    analyzer, isKnown: pagefindKnows(pf, fa),
    words: fetchWords("http://demo.check/fa-words/", async (url) => new Response(readFileSync(new URL(String(url).split("/").pop()!, WORDS)))),
  });
  for (const q of replay) {
    const row = found.get(q.type) ?? { n: 0, stock: 0, fa: 0, fixed: 0 };
    found.set(q.type, row);
    if (name === "stock") row.n++;
    let results: Awaited<ReturnType<typeof top>>, searched = q.text;
    if (name === "fa") {
      const r = await rescue.rescueSearch((t) => top(pf, fa.processQuery(t)), q.text);
      results = r.results;
      searched = r.query;
      if (r.fix) {
        row.fixed++;
        if (r.fix.pieces.length) weakBytes.push(r.fix.pieces.reduce((n, k) => n + (sizes.get(k) ?? 0), sizes.get("index.json") ?? 0));
      }
    } else results = await top(pf, q.text);
    if (results.some((d) => d.url.replace(/^\/pagefind-\w+/, "") === q.url || d.url.endsWith(q.url))) row[name]++;
    if (name === "fa") {
      for (const d of results.slice(0, 3)) {
        const shown = fa.processResult({ ...d, meta: { ...d.meta } }, searched);
        const ex = shown.excerpt;
        // The displayed title is the page's own (the index side ranks its terms instead).
        if (d.meta.fa_title && shown.meta.title === d.meta.fa_title && !("fa_title" in shown.meta)) titles++;
        excerpts++;
        if (/[⁅⁆]/.test(ex)) soup++;
        if (ex.includes("<mark>")) marked++;
      }
    }
  }
  await pf.close();
}

console.log("| type | queries | stock | fa-search-kit | searched as a fix |");
console.log("|---|---:|---:|---:|---:|");
const pct = (x: number, n: number) => `${Math.round((100 * x) / n)}%`;
let n = 0, s = 0, f = 0;
for (const [type, r] of found) {
  console.log(`| ${type} | ${r.n} | ${pct(r.stock, r.n)} | ${pct(r.fa, r.n)} | ${pct(r.fixed, r.n)} |`);
  n += r.n; s += r.stock; f += r.fa;
}
console.log(`| all | ${n} | ${pct(s, n)} | ${pct(f, n)} | |`);
const at = (p: number) => weakBytes.slice().sort((a, b) => a - b)[Math.floor(p * (weakBytes.length - 1))]! / 1024;
console.log(`\nword list: ${([...sizes.values()].reduce((a, b) => a + b, 0) / 1024).toFixed(1)} KB in ${sizes.size - 1} pieces; a weak search that needed pieces downloaded median ${at(0.5).toFixed(1)} KB, p95 ${at(0.95).toFixed(1)} KB (${weakBytes.length} searches, cold cache)`);
console.log(`\nfa results (top 3 per query): ${excerpts}; excerpt showing the hidden block: ${soup}; excerpt with a marked word: ${pct(marked, excerpts)}; own title shown: ${pct(titles, excerpts)}`);
if (soup || titles < excerpts) process.exitCode = 1;
