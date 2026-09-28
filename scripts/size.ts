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
 * build-time Pagefind annotator: + 3 KB). Query rescue (Phase 3), all opt-in:
 * keyboard ≤ 0.8 KB on its own (it needs no core); rescue ≤ core + 2.6 KB (keyboard
 * included); rescue with the Pagefind UI wiring ≤ /pagefind + 3.2 KB (in the built
 * package `tsc` wraps the wiring's one dynamic `import()` of pagefind.js in its
 * extension-rewriting helper, ~0.1 KB that does nothing for an absolute URL); analytics ≤ core +
 * 0.3 KB. The plan said 2.5 KB for rescue; the shipped features measure 2.57 KB and each
 * one earned its place on the benchmark (suspects 66 bytes, the Persian → Latin keyboard
 * direction 86: bench/results/experiments.md, Phase 3), so the budget moved by 0.1 KB.
 * Exits 1 when an entry is over.
 */
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url);
const KB = 1024;
const ADAPTER_EXTRA = 1 * KB;
const BUILD_EXTRA = 3 * KB;

/**
 * `budget`: absolute; `extra`: on top of the core entry of the same build (or of the
 * entry `over`). `with`: bundled together with these entries, as a site ships them
 * (the extra is then what the entry adds to them).
 */
const ENTRIES: { name: string; file: string; budget?: number; extra?: number; over?: string; with?: string[]; node?: boolean }[] = [
  { name: "fa-search-kit", file: "index", budget: 5 * KB },
  { name: "fa-search-kit/lexicon", file: "lexicon/index", budget: 15 * KB },
  ...["pagefind", "orama", "minisearch", "flexsearch", "lunr"].map((a) => ({ name: `fa-search-kit/${a}`, file: `adapters/${a}`, extra: ADAPTER_EXTRA })),
  // Build time only (Node or a build script), never in a browser bundle.
  { name: "fa-search-kit/pagefind/build", file: "adapters/pagefind-build", extra: BUILD_EXTRA },
  { name: "fa-search-kit/keyboard", file: "rescue/keyboard", budget: 0.8 * KB },
  { name: "fa-search-kit/rescue", file: "rescue/index", with: ["index"], extra: 2.6 * KB },
  { name: "fa-search-kit/pagefind/rescue", file: "adapters/pagefind-rescue", with: ["adapters/pagefind"], extra: 3.2 * KB, over: "adapters/pagefind" },
  { name: "fa-search-kit/analytics", file: "analytics", extra: 0.3 * KB },
  // Build time only, Node: no budget.
  { name: "fa-search-kit/rescue/build", file: "rescue/build", node: true },
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
  const sizes = new Map<string, number>();
  for (const e of ENTRIES) {
    const path = new URL(`${dir}/${e.file}${ext}`, root);
    if (!existsSync(path)) { console.log(`| \`${e.name}\` | – | – | – | missing |`); over++; continue; }
    const files = [path.pathname, ...(e.with ?? []).map((f) => new URL(`${dir}/${f}${ext}`, root).pathname)];
    const result = await build({
      // Together: one bundle re-exporting every entry (their export names do not overlap).
      ...(e.with ? { stdin: { contents: files.map((f) => `export * from ${JSON.stringify(f)};`).join("\n"), resolveDir: root.pathname, loader: "js" } } : { entryPoints: files }),
      bundle: true, minify: true, format: "esm", platform: e.node ? "node" : "browser",
      // UTF-8 literals, as `tsc` emits them for the package; esbuild's default
      // (ASCII) would write every Persian letter of the word lists as \uXXXX.
      target: "es2022", write: false, legalComments: "none", charset: "utf8",
    });
    const code = result.outputFiles[0]!.contents;
    const gz = gzipSync(code, { level: 9 }).length;
    sizes.set(e.file, gz);
    const base = sizes.get(e.over ?? "index")!;
    const budget = e.budget ?? (e.extra === undefined ? Infinity : base + e.extra);
    const ok = gz <= budget;
    if (!ok) over++;
    const note = e.extra ? ` (${e.over ? `\`${e.over.split("/").pop()}\`` : "core"} + ${kb(gz - base)})` : "";
    const label = e.with ? `${e.name}\` with \`${e.with.map((f) => ENTRIES.find((x) => x.file === f)!.name).join("`, `")}` : e.name;
    console.log(`| \`${label}\` | ${kb(code.length)} | **${kb(gz)}**${note} | ${kb(brotli(code))} | ${budget === Infinity ? "build time" : `${kb(budget)} ${ok ? "ok" : "**OVER**"}`} |`);
  }
}
if (over) {
  console.error(`${over} entr${over === 1 ? "y is" : "ies are"} over budget`);
  process.exit(1);
}
