/**
 * The package as a consumer gets it: `npm pack`, install the tarball into a fresh
 * project with the pinned engines, then
 * - import every subpath under Node and run one Persian query per adapter with its engine;
 * - bundle every subpath with esbuild (browser, or Node for the build-time ones);
 * - type-check a consumer file against the published .d.ts (strict, nodenext, no skipLibCheck);
 * - run the Pagefind CLI over a tiny site and index it with Pagefind.
 *
 *     node scripts/smoke-pack.ts [--keep]
 *
 * Needs the npm registry (the engines are installed from it). Exits 1 on any failure.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { keep: { type: "boolean", default: false } } });
const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "fa-search-kit-smoke-"));
const run = (cmd: string, args: string[], cwd = dir) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
const step = (s: string) => console.log(`\n== ${s}`);

async function main() {
try {
  step("build and pack");
  run("npm", ["run", "build"], root);
  const tarball = run("npm", ["pack", "--pack-destination", dir, "--silent"], root).trim().split("\n").at(-1)!;
  const dev = pkg.devDependencies as Record<string, string>;
  const engines = ["@orama/orama", "flexsearch", "lunr", "minisearch", "pagefind", "esbuild", "typescript", "@types/node", "@types/lunr"];
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  step(`install ${tarball} + ${engines.map((e) => `${e}@${dev[e]}`).join(" ")}`);
  run("npm", ["install", "--no-audit", "--no-fund", "--silent", join(dir, tarball), ...engines.map((e) => `${e}@${dev[e]}`)]);

  step("every subpath under Node, one query per adapter");
  writeFileSync(join(dir, "smoke.mjs"), SMOKE);
  process.stdout.write(run("node", ["smoke.mjs"]));

  step("bundle every subpath with esbuild");
  const subpaths = Object.keys(pkg.exports).filter((k) => k !== "./package.json");
  for (const sub of subpaths) {
    const spec = sub === "." ? "fa-search-kit" : `fa-search-kit/${sub.slice(2)}`;
    const node = sub === "./pagefind/build" || sub === "./rescue/build";
    writeFileSync(join(dir, "entry.mjs"), `export * from "${spec}";\n`);
    run("npx", ["esbuild", "entry.mjs", "--bundle", "--format=esm", `--platform=${node ? "node" : "browser"}`, "--outfile=out.js", "--log-level=error"]);
    console.log(`ok ${spec}`);
  }

  step("type-check a consumer against the published types");
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "es2022", module: "nodenext", moduleResolution: "nodenext", strict: true, noEmit: true, skipLibCheck: false, types: ["node"] },
    files: ["consumer.ts"],
  }));
  writeFileSync(join(dir, "consumer.ts"), CONSUMER);
  // Engines' own .d.ts files have errors of their own under skipLibCheck: false
  // (FlexSearch 0.8.212); only ours and the consumer's count.
  let out = "";
  try { run("npx", ["tsc", "-p", "."]); } catch (e) { out = String((e as { stdout?: string }).stdout ?? e); }
  const ours = out.split("\n").filter((l) => /^(consumer\.ts|node_modules\/fa-search-kit\/)/.test(l));
  if (ours.length) throw new Error(`type errors:\n${ours.join("\n")}`);
  console.log(`ok${out ? ` (${out.split("\n").filter((l) => /error TS/.test(l)).length} errors in engines' own .d.ts ignored)` : ""}`);

  step("CLI over a tiny site, then Pagefind");
  mkdirSync(join(dir, "site/a"), { recursive: true });
  writeFileSync(join(dir, "site/a/index.html"), `<!doctype html><html lang="fa"><body><h1>كتابهاي قديمي</h1></body></html>`);
  process.stdout.write(run("npx", ["fa-search-kit-pagefind", "site", "--profile", "full", "--words"]));
  if (!readFileSync(join(dir, "site/a/index.html"), "utf8").includes("data-fa-search")) throw new Error("CLI did not annotate");
  if (!JSON.parse(readFileSync(join(dir, "site/fa-words/index.json"), "utf8")).keys.length) throw new Error("CLI wrote no word list");
  process.stdout.write(run("npx", ["pagefind", "--site", "site", "--silent"]) || "pagefind ok\n");

  console.log("\nsmoke-pack: all passed");
} finally {
  if (values.keep) console.log(`kept ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
}
}

// Written into the consumer project, so it resolves fa-search-kit from node_modules.
const SMOKE = String.raw`
import assert from "node:assert/strict";
import { create, insertMultiple, search } from "@orama/orama";
import FlexSearch from "flexsearch";
import lunr from "lunr";
import MiniSearch from "minisearch";
import { createAnalyzer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";
import { faTokenizer } from "fa-search-kit/orama";
import { faMiniSearch } from "fa-search-kit/minisearch";
import { faDocument, faEncode } from "fa-search-kit/flexsearch";
import { faLunr } from "fa-search-kit/lunr";
import { faPagefind } from "fa-search-kit/pagefind";
import { faPagefindIndex } from "fa-search-kit/pagefind/build";
import { createRescue } from "fa-search-kit/rescue";
import { createWordList } from "fa-search-kit/rescue/build";
import { keyboardCandidates } from "fa-search-kit/keyboard";
import { rescuePagefindUI } from "fa-search-kit/pagefind/rescue";
import { canonicalKey } from "fa-search-kit/analytics";

const docs = [{ id: "a", title: "كتابهاي قديمي" }, { id: "b", title: "ماشین قرمز" }];
const q = "کتاب";
assert.deepEqual(createAnalyzer({ profile: "full", lexicon }).analyze("می‌روم", { mode: "query" }), ["رفت"]);

const db = create({ schema: { title: "string" }, components: { tokenizer: faTokenizer() } });
await insertMultiple(db, docs);
assert.equal((await search(db, { term: q })).hits[0]?.id, "a");
console.log("ok orama");

const ms = new MiniSearch({ fields: ["title"], ...faMiniSearch() });
ms.addAll(docs);
assert.equal(ms.search(q)[0]?.id, "a");
console.log("ok minisearch");

const fx = faDocument(FlexSearch, { document: { id: "id", index: ["title"] } });
for (const d of docs) fx.add(d);
assert.equal(fx.search(q, { merge: true })[0]?.id, "a");
const fe = new FlexSearch.Document({ document: { id: "id", index: ["title"] }, encode: faEncode() });
for (const d of docs) fe.add(d);
assert.equal(fe.search(q, { merge: true })[0]?.id, "a");
console.log("ok flexsearch");

const fl = faLunr(lunr);
const idx = lunr(function () { this.use(fl); this.ref("id"); this.field("title"); for (const d of docs) this.add(d); });
assert.equal(fl.search(idx, q + " ~^:")[0]?.ref, "a");
console.log("ok lunr");

const pagefind = await import("pagefind");
const { index } = await pagefind.createIndex({ forceLanguage: "fa" });
const errors = await faPagefindIndex().addPages(index, docs.map((d) => ({ url: "/" + d.id + "/", content: "<html lang=fa><body><h1>" + d.title + "</h1></body></html>" })));
assert.deepEqual(errors, []);
const { files } = await index.getFiles();
assert.ok(files.length > 0);
await pagefind.close();
assert.equal(faPagefind().processQuery("كتابهاي"), q);
console.log("ok pagefind (index built; query " + faPagefind().processQuery("كتابهاي") + ")");

assert.ok(keyboardCandidates("nd[d").includes("دیجی"));
assert.equal(canonicalKey("كتابها"), canonicalKey("کتاب"));
const rescue = createRescue({ analyzer: createAnalyzer() });
for (const d of docs) rescue.addText(d.title);
const r = await rescue.rescueSearch((t) => ms.search(t), "ماشین غرمز");
assert.equal(r.results[0]?.id, "b");
assert.equal(r.fix?.to, "ماشین قرمز");
const words = createWordList();
words.add("کتاب قدیمی");
assert.ok(words.files().has("index.json"));
assert.equal(typeof rescuePagefindUI, "function");
console.log("ok rescue, keyboard, analytics (fixed «ماشین غرمز» → «" + r.fix.to + "»)");
`;

const CONSUMER = `
import { createAnalyzer, type Analyzer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";
import { faTokenizer, type OramaTokenizer } from "fa-search-kit/orama";
import { faMiniSearch } from "fa-search-kit/minisearch";
import { faDocument, faEncode } from "fa-search-kit/flexsearch";
import { faLunr } from "fa-search-kit/lunr";
import { faPagefind, type PagefindResultData } from "fa-search-kit/pagefind";
import { faPagefindIndex } from "fa-search-kit/pagefind/build";
import { createRescue, fetchWords, type Fix, type RescueResult } from "fa-search-kit/rescue";
import { createWordList } from "fa-search-kit/rescue/build";
import { keyboardCandidates } from "fa-search-kit/keyboard";
import { rescuePagefindUI, type PagefindNotice } from "fa-search-kit/pagefind/rescue";
import { canonicalKey } from "fa-search-kit/analytics";
import MiniSearch from "minisearch";
import lunr from "lunr";
import FlexSearch from "flexsearch";
import { create } from "@orama/orama";

const a: Analyzer = createAnalyzer({ profile: "full", lexicon });
const t: OramaTokenizer = faTokenizer({ analyzer: a });
create({ schema: { title: "string" } as const, components: { tokenizer: t } });
new MiniSearch({ fields: ["title"], ...faMiniSearch({ combineWith: "AND" }) });
const doc = faDocument(FlexSearch, { document: { id: "id", index: ["title"] } });
new FlexSearch.Document({ document: { id: "id", index: ["title"] }, encode: faEncode() });
const fl = faLunr(lunr);
const idx = lunr(function (this: lunr.Builder) { this.use(fl); this.ref("id"); this.field("title"); });
const hits: lunr.Index.Result[] = fl.search(idx, "کتاب");
const r: PagefindResultData = faPagefind().processResult({ content: "", excerpt: "" });
const html: string = faPagefindIndex({ lexicon, terms: "all" }).annotateHtml("<p>x</p>");
const rescue = createRescue({ analyzer: a, words: fetchWords("https://example.com/fa-words/") });
const found: Promise<RescueResult<string>> = rescue.rescueSearch((q: string) => [q], "کتاب");
const fix: Fix | undefined = undefined;
const list = createWordList({ analyzer: a });
const ui = rescuePagefindUI({ fa: faPagefind(), lexicon, bundlePath: "/pagefind/", onNotice: (n?: PagefindNotice) => n?.asTyped() });
const k: string = canonicalKey("کتاب", { analyzer: a }) + keyboardCandidates("nd[d").join();
export { doc, hits, r, html, found, fix, list, ui, k };
`;

await main();
