/**
 * The demo: a plain static site of real Persian pages, searched side by side by
 * stock Pagefind and by Pagefind with fa-search-kit.
 *
 *     node demo/build.ts            # writes demo/dist/ (gitignored)
 *     npx serve demo/dist           # or any static server
 *
 * Needs the benchmark data (bench/data/, see bench/README.md). Picks ~300
 * Wikipedia articles and ~300 Digikala products from the benchmark corpora,
 * preferring targets of benchmark queries so the replay panel has answers, and
 * writes one page each with its source credited. Then two Pagefind indexes from
 * the same pages: `pagefind-stock/` (Pagefind's defaults) and `pagefind-fa/`
 * (pages annotated by fa-search-kit/pagefind/build, full profile).
 *
 * Licence: the pages quote Wikipedia (CC BY-SA 3.0) and Digikala product titles;
 * the built demo is CC BY-SA and is never bundled with the package.
 */
import { build as esbuild } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { faPagefindIndex } from "../src/adapters/pagefind-build.ts";
import { lexicon } from "../src/lexicon/index.ts";
import { loadCorpus, type CorpusName, type Doc } from "../bench/corpus.ts";
import { loadQueries, type Query } from "../bench/queries.ts";
import { rng, seedOf } from "../bench/lib/rng.ts";

const { values } = parseArgs({ options: { per: { type: "string", default: "300" } } });
const PER = Number(values.per);
const DIST = new URL("dist/", import.meta.url);
const SRC = new URL("src/", import.meta.url);
/** Variant types the replay shows: what an analyzer can fix (typos and layouts are Phase 3). */
const REPLAY_TYPES = ["canonical", "std-typing", "arabic-yk", "alef-madda", "hamza", "heh-yeh", "diacritics", "digits", "zwnj-space", "zwnj-join", "zwnj-add", "plural-add", "plural-drop", "clitic-add", "combo"];
const SOURCES: Record<"wiki" | "products", { label: string; link(d: Doc): string; credit: string }> = {
  wiki: {
    label: "ویکی‌پدیا",
    link: (d) => `https://fa.wikipedia.org/?curid=${d.id.slice(1)}`,
    credit: 'متن از <a href="%LINK%">ویکی‌پدیای فارسی</a>، با مجوز <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.fa">CC BY-SA 3.0</a> (نسخهٔ ۲۰۲۳-۱۱-۰۱، ۳٬۰۰۰ نویسهٔ نخست).',
  },
  products: {
    label: "دیجی‌کالا",
    link: (d) => `https://www.digikala.com/product/dkp-${d.id.slice(1)}/`,
    credit: 'عنوان کالا از <a href="%LINK%">دیجی‌کالا</a>، از مجموعه‌دادهٔ <a href="https://huggingface.co/datasets/RadeAI/Digikala_comments_products">RadeAI/Digikala_comments_products</a>.',
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const shell = (title: string, body: string, depth: number) => `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${"../".repeat(depth)}style.css">
</head>
<body>
${body}
</body>
</html>
`;

/** Targets with the most replayable queries first (seeded tie-break), up to `n`. */
function pick(corpus: CorpusName, docs: Doc[], queries: Query[], n: number): Doc[] {
  const byTarget = new Map<string, number>();
  for (const q of queries) if (REPLAY_TYPES.includes(q.type)) byTarget.set(q.target, (byTarget.get(q.target) ?? 0) + 1);
  const random = rng(seedOf(`demo/${corpus}`));
  const keyed = docs.map((d) => ({ d, k: (byTarget.get(d.id) ?? 0) + random() }));
  return keyed.sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.d);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const pages: { url: string; content: string }[] = [];
const replay: { type: string; text: string; url: string; corpus: string }[] = [];
for (const corpus of ["wiki", "products"] as const) {
  const docs = await loadCorpus(corpus);
  const queries = loadQueries(corpus);
  const chosen = pick(corpus, docs, queries, PER);
  const src = SOURCES[corpus];
  const urls = new Map<string, string>();
  for (const d of chosen) {
    const url = `/${corpus}/${d.id}/`;
    urls.set(d.id, url);
    const body = `<header class="site"><a href="../../">جست‌وجوی فارسی: مقایسه</a> · ${src.label}</header>
<main>
<article data-pagefind-body>
<h1>${esc(d.title)}</h1>
<p>${esc(d.body)}</p>
</article>
</main>
<footer>${src.credit.replace("%LINK%", src.link(d))} <a href="../../licence/">دربارهٔ داده‌ها و مجوز</a></footer>`;
    const content = shell(d.title, body, 2);
    mkdirSync(new URL(`.${url}`, DIST), { recursive: true });
    writeFileSync(new URL(`.${url}index.html`, DIST), content);
    pages.push({ url, content });
  }
  for (const q of queries) {
    const url = urls.get(q.target);
    if (url && REPLAY_TYPES.includes(q.type)) replay.push({ type: q.type, text: q.text, url, corpus });
  }
  console.log(`${corpus}: ${chosen.length} pages, ${replay.filter((r) => r.corpus === corpus).length} replay queries`);
}

// Licence page (not indexed: it has no data-pagefind-body).
writeFileSync(new URL("licence/index.html", (mkdirSync(new URL("licence/", DIST)), DIST)), shell("داده‌ها و مجوز", readFileSync(new URL("licence.html", SRC), "utf8"), 1));
writeFileSync(new URL("replay.json", DIST), JSON.stringify(replay));
cpSync(new URL("index.html", SRC), new URL("index.html", DIST));
cpSync(new URL("style.css", SRC), new URL("style.css", DIST));
await esbuild({
  entryPoints: [new URL("app.ts", SRC).pathname], bundle: true, minify: true, format: "esm", platform: "browser",
  target: "es2022", charset: "utf8", outfile: new URL("app.js", DIST).pathname, logLevel: "warning",
});

// Two Pagefind indexes over the same pages.
const pagefind = await import("pagefind");
for (const [name, annotate] of [["pagefind-stock", false], ["pagefind-fa", true]] as const) {
  const { index } = await pagefind.createIndex({ forceLanguage: "fa" });
  if (!index) throw new Error("pagefind: createIndex failed");
  const errors = annotate
    ? await faPagefindIndex({ profile: "full", lexicon }).addPages(index, pages)
    : (await Promise.all(pages.map((p) => index.addHTMLFile(p)))).flatMap((r) => r.errors);
  if (errors.length) throw new Error(errors.join("; "));
  await index.writeFiles({ outputPath: new URL(name, DIST).pathname });
  console.log(`${name}: ${pages.length} pages`);
}
await pagefind.close();
console.log(`wrote ${DIST.pathname}`);
