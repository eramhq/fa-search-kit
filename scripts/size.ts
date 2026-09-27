/**
 * Size budgets, enforced: each published entry bundled on its own (esbuild,
 * minified ESM, browser target, UTF-8), then gzip -9 and Brotli 11.
 *
 *     node scripts/size.ts
 *
 * Budgets (CLAUDE.md): core (normalize + tokenize + stem, including the
 * vendored Snowball stemmer) ≤ 5 KB gzipped; lexicon ≤ 15 KB gzipped.
 * Exits 1 when an entry is over.
 */
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url);
const KB = 1024;

const ENTRIES = [
  { name: "fa-search", file: "src/index.ts", budget: 5 * KB },
  { name: "fa-search/lexicon", file: "src/lexicon/index.ts", budget: 15 * KB },
];

const brotli = (data: Uint8Array) =>
  brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }).length;

let over = 0;
console.log("| entry | raw | gzip | brotli | budget (gzip) |");
console.log("|---|---:|---:|---:|---:|");
for (const e of ENTRIES) {
  const path = new URL(e.file, root);
  if (!existsSync(path)) { console.log(`| \`${e.name}\` | – | – | – | not built yet |`); continue; }
  const result = await build({
    entryPoints: [path.pathname], bundle: true, minify: true, format: "esm", platform: "browser",
    // UTF-8 literals, as `tsc` emits them for the package; esbuild's default
    // (ASCII) would write every Persian letter of the word lists as \uXXXX.
    target: "es2022", write: false, legalComments: "none", charset: "utf8",
  });
  const code = result.outputFiles[0]!.contents;
  const gz = gzipSync(code, { level: 9 }).length;
  const ok = gz <= e.budget;
  if (!ok) over++;
  const kb = (n: number) => `${(n / KB).toFixed(2)} KB`;
  console.log(`| \`${e.name}\` | ${kb(code.length)} | **${kb(gz)}** | ${kb(brotli(code))} | ${kb(e.budget)} ${ok ? "ok" : "**OVER**"} |`);
}
if (over) {
  console.error(`${over} entr${over === 1 ? "y is" : "ies are"} over budget`);
  process.exit(1);
}
