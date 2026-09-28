#!/usr/bin/env node
/**
 * fa-search-kit-pagefind: add the analyzer's index terms to every HTML page of a
 * built site, in place, before Pagefind indexes it.
 *
 *     npx fa-search-kit-pagefind dist [--profile light|standard|full] [--verbs lemma|stem] [--words [--words-dir dir]]
 *     npx pagefind --site dist
 *
 * `--words` also writes the site's word list for query rescue (fa-search-kit/rescue),
 * by default into `<site>/fa-words/`, next to Pagefind's output folder.
 *
 * Query with the same options: `faPagefind({ ... })` in the browser. Running it
 * twice is safe: existing blocks are replaced.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Profile } from "../analyzer.ts";
import { createWordList } from "../rescue/build.ts";
import { BODY, faPagefindIndex } from "./pagefind-build.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    profile: { type: "string", default: "standard" }, verbs: { type: "string" },
    words: { type: "boolean", default: false }, "words-dir": { type: "string" }, help: { type: "boolean", short: "h" },
  },
});
const site = positionals[0];
if (values.help || !site) {
  console.log("usage: fa-search-kit-pagefind <site-dir> [--profile light|standard|full] [--verbs lemma|stem] [--words [--words-dir <dir>]]");
  process.exit(values.help ? 0 : 1);
}
const profile = values.profile as Profile;
if (!["light", "standard", "full"].includes(profile)) throw new Error(`unknown profile ${profile}`);
const lexicon = profile === "full" ? (await import("../lexicon/index.ts")).lexicon : undefined;
const words = values.words || values["words-dir"] ? createWordList() : undefined;
const fa = faPagefindIndex({ profile, lexicon, words, ...(values.verbs ? { verbs: values.verbs as "lemma" | "stem" } : {}) });

const files = readdirSync(site, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.html?$/i.test(e.name)).map((e) => join(e.parentPath, e.name));
// As Pagefind: once one page has data-pagefind-body, pages without it are not indexed.
const bodies = files.some((f) => BODY.test(readFileSync(f, "utf8")));
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const out = fa.annotateHtml(html, { words: !bodies || BODY.test(html) });
  if (out !== html) writeFileSync(file, out);
}
const pages = files.length;
console.log(`fa-search-kit: annotated ${pages} page(s) in ${site} (profile ${profile}${values.verbs ? `, verbs ${values.verbs}` : ""}); query with the same options.`);
if (words) {
  const dir = values["words-dir"] ?? join(site, "fa-words");
  const bytes = words.write(dir);
  console.log(`fa-search-kit: wrote the word list for query rescue to ${dir} (${(bytes / 1024).toFixed(1)} KB, downloaded piece by piece only by weak searches).`);
}
