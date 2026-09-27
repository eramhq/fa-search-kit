#!/usr/bin/env node
/**
 * fa-search-kit-pagefind: add the analyzer's index terms to every HTML page of a
 * built site, in place, before Pagefind indexes it.
 *
 *     npx fa-search-kit-pagefind dist [--profile light|standard|full] [--verbs lemma|stem]
 *     npx pagefind --site dist
 *
 * Query with the same options: `faPagefind({ ... })` in the browser. Running it
 * twice is safe: existing blocks are replaced.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Profile } from "../analyzer.ts";
import { faPagefindIndex } from "./pagefind-build.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { profile: { type: "string", default: "standard" }, verbs: { type: "string" }, help: { type: "boolean", short: "h" } },
});
const site = positionals[0];
if (values.help || !site) {
  console.log("usage: fa-search-kit-pagefind <site-dir> [--profile light|standard|full] [--verbs lemma|stem]");
  process.exit(values.help ? 0 : 1);
}
const profile = values.profile as Profile;
if (!["light", "standard", "full"].includes(profile)) throw new Error(`unknown profile ${profile}`);
const lexicon = profile === "full" ? (await import("../lexicon/index.ts")).lexicon : undefined;
const fa = faPagefindIndex({ profile, lexicon, ...(values.verbs ? { verbs: values.verbs as "lemma" | "stem" } : {}) });

let pages = 0;
for (const entry of readdirSync(site, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.html?$/i.test(entry.name)) continue;
  const file = join(entry.parentPath, entry.name);
  const html = readFileSync(file, "utf8");
  const out = fa.annotateHtml(html);
  if (out !== html) writeFileSync(file, out);
  pages++;
}
console.log(`fa-search-kit: annotated ${pages} page(s) in ${site} (profile ${profile}${values.verbs ? `, verbs ${values.verbs}` : ""}); query with the same options.`);
