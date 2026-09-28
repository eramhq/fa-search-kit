/**
 * Extra query sets for Phase 3 (query rescue), kept out of the main query files so
 * every cached main run stays valid. Written by bench/rescue-queries.ts to
 * bench/data/queries/<corpus>.rescue.jsonl; run with `node bench/run.ts --set rescue`.
 *
 * - **False fixes** (`ff-*`, no target): one-word queries that are fine as typed but
 *   not on the site, so a rescue could rewrite them. A rewrite is a false fix (want ≈ 0):
 *   ff-real (real Persian words, ≥ 4 letters), ff-short (2–3 letters), ff-latin (Latin
 *   brands, models and words), ff-digits (tokens with digits), ff-name (proper names from
 *   the UD treebanks), ff-inflected (an inflected form of a site word, the form itself
 *   not on the site: the analyzer, not the speller, should carry it).
 * - **Uniform typos** (`typo-uniform`, dev split only): the circularity guard. The main
 *   typo generators draw from the same sound-alike groups and neighbouring keys the
 *   speller's costs favour; here one letter of a content word, the first included, is
 *   replaced by a uniformly random Persian letter.
 */
import { readFileSync } from "node:fs";
import { QUERY_DIR, type Query } from "../queries.ts";
import type { CorpusName } from "../corpus.ts";
import { isArabicScript, rawTokens, ZWNJ } from "./persian.ts";
import { pick, rng, seedOf, shuffle } from "./rng.ts";

export const SET_TYPES = ["ff-real", "ff-short", "ff-latin", "ff-digits", "ff-name", "ff-inflected", "typo-uniform"] as const;
export const PER_TYPE = 300;
const LETTERS = [..."ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی"];

export function loadSet(corpus: CorpusName, set: string): Query[] {
  return readFileSync(new URL(`${corpus}.${set}.jsonl`, QUERY_DIR), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Query);
}

export interface SetInput {
  corpus: CorpusName;
  /** The site's words, as keys (`siteKey`). */
  site: Set<string>;
  vocab: Map<string, number>;
  /** Proper-noun forms from the UD treebanks. */
  names: Set<string>;
  stop: Set<string>;
  /** Main queries of the corpus (the canonical dev queries seed typo-uniform). */
  queries: Query[];
  /** Split of a base id. */
  splitOf(base: string): "dev" | "test";
}

/** A word "on the site" in any spelling: lowercased, Arabic ي/ك folded, no ZWNJ, آ → ا, digits folded. */
export const siteKey = (w: string) =>
  w.toLowerCase().replace(/[يى]/g, "ی").replace(/ك/g, "ک").replaceAll(ZWNJ, "").replaceAll("آ", "ا").replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));

const persianOnly = (w: string) => /^[\u0621-\u063a\u0641-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc\u0622\u200c]+$/.test(w);
const letters = (w: string) => w.replaceAll(ZWNJ, "").length;
const SUFFIXES = ["ها", "های", "هایی", "ان", "ات", "م", "ت", "ش", "مان", "تان", "شان", "ی"];

export function buildSet(input: SetInput): Query[] {
  const { corpus, site, vocab } = input;
  const absent = (w: string) => !site.has(siteKey(w));
  // Vocabulary in a stable order, so the seeded samples do not depend on Map order.
  const words = [...vocab].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const pools: Record<string, string[]> = {
    "ff-real": words.filter(([w, n]) => n >= 20 && persianOnly(w) && !w.includes(ZWNJ) && letters(w) >= 4 && absent(w)).map(([w]) => w),
    "ff-short": words.filter(([w, n]) => n >= 50 && persianOnly(w) && letters(w) >= 2 && letters(w) <= 3 && absent(w)).map(([w]) => w),
    "ff-latin": words.filter(([w, n]) => n >= 20 && /^[a-z][a-z\d-]*[a-z\d]$/i.test(w) && w.length >= 3 && absent(w)).map(([w]) => w),
    "ff-digits": words.filter(([w, n]) => n >= 20 && /\d|[۰-۹]/.test(w) && /^[\p{L}\p{N}]+$/u.test(w) && absent(w)).map(([w]) => w),
    "ff-name": [...input.names].sort().filter((w) => persianOnly(w) && letters(w) >= 3 && absent(w)),
    "ff-inflected": words.filter(([w, n]) => {
      if (n < 5 || !persianOnly(w) || !absent(w)) return false;
      const m = new RegExp(`^(.{3,}?)\u200c?(${SUFFIXES.join("|")})$`).exec(w);
      return !!m && !absent(m[1]!);
    }).map(([w]) => w),
  };
  const out: Query[] = [];
  for (const type of SET_TYPES.filter((t) => t !== "typo-uniform")) {
    const pool = shuffle(rng(seedOf(`${corpus}/${type}`)), pools[type]!).slice(0, PER_TYPE);
    pool.forEach((text, i) => {
      const id = `${corpus}-${type}-${i}`;
      out.push({ id, corpus, base: id, target: "", type, text });
    });
  }
  // typo-uniform: one letter of one content word of each dev canonical query.
  const canon = input.queries.filter((q) => q.type === "canonical" && !q.supplement && input.splitOf(q.base) === "dev");
  let n = 0;
  for (const q of canon) {
    if (n >= PER_TYPE) break;
    const random = rng(seedOf(`${q.base}/typo-uniform`));
    const tokens = q.text.split(" ");
    const idx = tokens.map((_, i) => i).filter((i) => isArabicScript(tokens[i]!) && letters(tokens[i]!) >= 4 && !input.stop.has(tokens[i]!));
    if (!idx.length) continue;
    const i = pick(random, idx);
    const chars = [...tokens[i]!];
    const p = pick(random, chars.map((_, k) => k).filter((k) => chars[k] !== ZWNJ));
    chars[p] = pick(random, LETTERS.filter((c) => c !== chars[p]));
    tokens[i] = chars.join("");
    out.push({ id: `${q.base}/typo-uniform`, corpus, base: q.base, target: q.target, type: "typo-uniform", subtype: p === 0 ? "first" : "inner", text: tokens.join(" ") });
    n++;
  }
  return out;
}

/** Every word of a corpus as a site key. */
export function siteKeys(docs: { title: string; body: string }[]): Set<string> {
  const site = new Set<string>();
  for (const d of docs) for (const t of rawTokens(`${d.title} ${d.body}`)) site.add(siteKey(t));
  return site;
}
