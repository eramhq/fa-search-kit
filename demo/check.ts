/**
 * The demo's replay panel, headless: every replay query against both built
 * indexes (the same pagefind.js + WASM a browser loads), found = target in the
 * top 10. Also checks that, after `processResult`, fa-search-kit's excerpts never
 * show the hidden block and every result shows the page's own title.
 *
 *     node demo/build.ts && node demo/check.ts
 */
import { readFileSync } from "node:fs";
import { faPagefind } from "../src/adapters/pagefind.ts";
import { lexicon } from "../src/lexicon/index.ts";
import { loadPagefind, type LoadedPagefind } from "../bench/lib/pagefind.ts";

const DIST = new URL("dist/", import.meta.url);
const replay = JSON.parse(readFileSync(new URL("replay.json", DIST), "utf8")) as { type: string; text: string; url: string }[];
const fa = faPagefind({ profile: "full", lexicon });

async function top(pf: LoadedPagefind, q: string) {
  const res = await pf.search(q);
  return Promise.all(res.results.slice(0, 10).map((r) => r.data()));
}

// One index at a time: the loader swaps a global fetch shim.
const found = new Map<string, { n: number; stock: number; fa: number }>();
let excerpts = 0, soup = 0, marked = 0, titles = 0;
for (const name of ["stock", "fa"] as const) {
  const pf = await loadPagefind(new URL(`pagefind-${name}`, DIST).pathname);
  for (const q of replay) {
    const row = found.get(q.type) ?? { n: 0, stock: 0, fa: 0 };
    found.set(q.type, row);
    if (name === "stock") row.n++;
    const results = await top(pf, name === "fa" ? fa.processQuery(q.text) : q.text);
    if (results.some((d) => d.url.replace(/^\/pagefind-\w+/, "") === q.url || d.url.endsWith(q.url))) row[name]++;
    if (name === "fa") {
      for (const d of results.slice(0, 3)) {
        const shown = fa.processResult({ ...d, meta: { ...d.meta } }, q.text);
        const ex = shown.excerpt;
        // The displayed title is the page's own (the index side ranks its terms instead).
        if (shown.meta.title === d.meta.fa_title && d.meta.fa_title) titles++;
        excerpts++;
        if (/[⁅⁆]/.test(ex)) soup++;
        if (ex.includes("<mark>")) marked++;
      }
    }
  }
  await pf.close();
}

console.log("| type | queries | stock | fa-search-kit |");
console.log("|---|---:|---:|---:|");
const pct = (x: number, n: number) => `${Math.round((100 * x) / n)}%`;
let n = 0, s = 0, f = 0;
for (const [type, r] of found) {
  console.log(`| ${type} | ${r.n} | ${pct(r.stock, r.n)} | ${pct(r.fa, r.n)} |`);
  n += r.n; s += r.stock; f += r.fa;
}
console.log(`| all | ${n} | ${pct(s, n)} | ${pct(f, n)} |`);
console.log(`\nfa results (top 3 per query): ${excerpts}; excerpt showing the hidden block: ${soup}; excerpt with a marked word: ${pct(marked, excerpts)}; own title shown: ${pct(titles, excerpts)}`);
if (soup || titles < excerpts) process.exitCode = 1;
