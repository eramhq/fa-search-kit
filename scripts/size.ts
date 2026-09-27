/**
 * Size budgets, enforced: each published entry bundled on its own (esbuild,
 * minified ESM, browser target, UTF-8), then gzip -9 and Brotli 11. Measured on
 * the sources and, when `npm run build` has run, on the built package (dist/).
 *
 *     node scripts/size.ts
 *
 * Budgets (CLAUDE.md): core (normalize + tokenize + stem, including the
 * vendored Snowball stemmer) ≤ 5 KB gzipped; lexicon ≤ 15 KB gzipped; each
 * browser adapter, which bundles the core, ≤ the core's measured size + 1 KB (the
 * build-time Pagefind annotator: + 3 KB).
 * Exits 1 when an entry is over.
 */
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url);
const KB = 1024;
const ADAPTER_EXTRA = 1 * KB;
const BUILD_EXTRA = 3 * KB;

/** `budget`: absolute; `extra`: on top of the core entry of the same build. */
const ENTRIES: { name: string; file: string; budget?: number; extra?: number }[] = [
  { name: "fa-search-kit", file: "index", budget: 5 * KB },
  { name: "fa-search-kit/lexicon", file: "lexicon/index", budget: 15 * KB },
  ...["pagefind", "orama", "minisearch", "flexsearch", "lunr"].map((a) => ({ name: `fa-search-kit/${a}`, file: `adapters/${a}`, extra: ADAPTER_EXTRA })),
  // Build time only (Node or a build script), never in a browser bundle.
  { name: "fa-search-kit/pagefind/build", file: "adapters/pagefind-build", extra: BUILD_EXTRA },
];

const brotli = (data: Uint8Array) =>
  brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }).length;
const kb = (n: number) => `${(n / KB).toFixed(2)} KB`;

let over = 0;
for (const [label, dir, ext] of [["sources", "src", ".ts"], ["built package", "dist/src", ".js"]] as const) {
  if (!existsSync(new URL(dir, root))) { console.log(`\n(${label}: not built; run npm run build)`); continue; }
  console.log(`\n${label} (${dir}/)\n`);
  console.log("| entry | raw | gzip | brotli | budget (gzip) |");
  console.log("|---|---:|---:|---:|---:|");
  let core = 0;
  for (const e of ENTRIES) {
    const path = new URL(`${dir}/${e.file}${ext}`, root);
    if (!existsSync(path)) { console.log(`| \`${e.name}\` | – | – | – | missing |`); over++; continue; }
    const result = await build({
      entryPoints: [path.pathname], bundle: true, minify: true, format: "esm", platform: "browser",
      // UTF-8 literals, as `tsc` emits them for the package; esbuild's default
      // (ASCII) would write every Persian letter of the word lists as \uXXXX.
      target: "es2022", write: false, legalComments: "none", charset: "utf8",
    });
    const code = result.outputFiles[0]!.contents;
    const gz = gzipSync(code, { level: 9 }).length;
    if (e.file === "index") core = gz;
    const budget = e.budget ?? core + e.extra!;
    const ok = gz <= budget;
    if (!ok) over++;
    const note = e.extra ? ` (core + ${kb(gz - core)})` : "";
    console.log(`| \`${e.name}\` | ${kb(code.length)} | **${kb(gz)}**${note} | ${kb(brotli(code))} | ${kb(budget)} ${ok ? "ok" : "**OVER**"} |`);
  }
}
if (over) {
  console.error(`${over} entr${over === 1 ? "y is" : "ies are"} over budget`);
  process.exit(1);
}
