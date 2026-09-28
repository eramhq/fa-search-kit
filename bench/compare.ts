/**
 * The gate: does config B beat config A without a real regression?
 *
 *     node bench/compare.ts snowball fa-standard [--split dev|test|all] [--corpus wiki]
 *     node bench/compare.ts fa-full lm-tree --set lemma    # an extra query set's runs
 *
 * Per corpus × engine × variant type, paired on the same queries:
 * - found/lost: exact binomial McNemar test on the discordant queries;
 * - reciprocal rank: Wilcoxon signed-rank test (news recall sits near the
 *   ceiling for OR engines, so rank moves show there first).
 * Benjamini–Hochberg over every test in the comparison. A cell **blocks** only
 * if q < .05 and it drops by ≥ 2 points (recall or MRR). Also reports the
 * engine-free coverage metric (share of queries whose terms are all among the
 * target document's terms) and lists every query that went from found to lost.
 * For query rescue configs also: the notice rate (share of queries searched as a fix)
 * per type, the false-fix and typo-uniform rows of the extra set
 * (bench/lib/rescue-sets.ts), and the word bytes per weak query.
 *
 * With `--set`, the cells are the extra set's types (and, for the lemma set, a
 * table by subtype); verb and morph-ud rows also get the per-lemma macro recall.
 *
 * Writes bench/results/compare/<A>--<B>[.<set>].<split>.md; exits 1 when something blocks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { configByName, type Config } from "./configs.ts";
import { CORPORA, loadCorpus, type CorpusName } from "./corpus.ts";
import { ENGINES } from "./engines.ts";
import { rawTokens } from "./lib/persian.ts";
import { bh, mcnemar, wilcoxon } from "./lib/stats.ts";
import { loadRun, macroByLemma, ORAMA_NOTE, splitQueries, VERB_TYPES } from "./lib/results.ts";
import type { Split } from "./lib/split.ts";
import { VARIANTS } from "./lib/variants.ts";
import { loadSet, SET_TYPES } from "./lib/rescue-sets.ts";
import { inSplit } from "./lib/split.ts";
import type { Query } from "./queries.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { split: { type: "string", default: "dev" }, corpus: { type: "string" }, set: { type: "string", default: "" }, quiet: { type: "boolean", default: false } },
});
if (positionals.length !== 2) throw new Error("usage: node bench/compare.ts <configA> <configB> [--split dev]");
const [nameA, nameB] = positionals as [string, string];
const split = values.split as Split;
const corpora = CORPORA.filter((c) => !values.corpus || c === values.corpus);
const SET = values.set!;
const queriesOf = (corpus: CorpusName) => (SET ? loadSet(corpus, SET).filter((q) => inSplit(q.base, split)) : splitQueries(corpus, split));
const types = SET ? [...new Set(corpora.flatMap((c) => queriesOf(c).map((q) => q.type)))] : VARIANTS.map(([t]) => t);
/** Rows averaged per lemma too: verb rows and the lemma set's. */
const perLemma = (type: string) => VERB_TYPES.has(type) || type.startsWith("morph-ud-");
const MIN_N = 10;
const ALPHA = 0.05;
const MIN_DROP = 0.02;

// --- cells ------------------------------------------------------------------------

interface Cell {
  corpus: CorpusName; engine: string; type: string; n: number;
  recallA: number; recallB: number; mrrA: number; mrrB: number;
  b: number; c: number; pFound: number; pRank: number; qFound?: number; qRank?: number;
  lost: Query[]; blocked?: boolean; up?: boolean; down?: boolean;
  macro?: { a: number; b: number; lemmas: number };
}

const cells: Cell[] = [];
const coverage: { corpus: string; type: string; n: number; a: number; b: number }[] = [];
const missing: string[] = [];
const subtypeRows: { corpus: CorpusName; engine: string; q: Query; a: boolean; b: boolean }[] = [];

/** Terms a config sees for a text: its analyzer, or plain lowercase raw tokens for engine-default configs. */
const termsOf = (config: Config, text: string, mode: "index" | "query") =>
  config.analyzer ? config.analyzer.analyze(text, mode) : rawTokens(text.toLowerCase());

const configA = configByName(nameA), configB = configByName(nameB);

for (const corpus of corpora) {
  const queries = queriesOf(corpus);
  const byType = new Map<string, Query[]>();
  for (const q of queries) byType.set(q.type, [...(byType.get(q.type) ?? []), q]);

  // Engine-free: are the query's terms all among the target's index terms?
  const docs = new Map((await loadCorpus(corpus)).map((d) => [d.id, d]));
  const docTerms = new Map<string, [Set<string>, Set<string>]>();
  for (const type of types) {
    const qs = byType.get(type) ?? [];
    if (qs.length < MIN_N) continue;
    let a = 0, b = 0;
    for (const q of qs) {
      let t = docTerms.get(q.target);
      if (!t) {
        const d = docs.get(q.target)!;
        const text = `${d.title} ${d.body}`;
        t = [new Set(termsOf(configA, text, "index")), new Set(termsOf(configB, text, "index"))];
        docTerms.set(q.target, t);
      }
      if (termsOf(configA, q.text, "query").every((x) => t[0].has(x))) a++;
      if (termsOf(configB, q.text, "query").every((x) => t[1].has(x))) b++;
    }
    coverage.push({ corpus, type, n: qs.length, a: a / qs.length, b: b / qs.length });
  }

  for (const engine of ENGINES.map((e) => e.name)) {
    const runA = loadRun(corpus, engine, nameA, split, SET), runB = loadRun(corpus, engine, nameB, split, SET);
    if (!runA || !runB) { missing.push(`${corpus}.${engine}`); continue; }
    if (SET) subtypeRows.push(...queries.map((q) => ({ corpus, engine, q, a: (runA.rank.get(q.id) ?? 0) > 0, b: (runB.rank.get(q.id) ?? 0) > 0 })));
    for (const type of types) {
      const qs = byType.get(type) ?? [];
      if (qs.length < MIN_N) continue;
      let b = 0, c = 0, fa = 0, fb = 0, ra = 0, rb = 0;
      const diffs: number[] = [];
      const lost: Query[] = [];
      for (const q of qs) {
        const x = runA.rank.get(q.id) ?? 0, y = runB.rank.get(q.id) ?? 0;
        const rrA = x ? 1 / x : 0, rrB = y ? 1 / y : 0;
        if (x) fa++;
        if (y) fb++;
        ra += rrA; rb += rrB;
        diffs.push(rrB - rrA);
        if (x && !y) { b++; lost.push(q); }
        if (!x && y) c++;
      }
      const n = qs.length;
      const cell: Cell = {
        corpus, engine, type, n, recallA: fa / n, recallB: fb / n, mrrA: ra / n, mrrB: rb / n,
        b, c, pFound: mcnemar(b, c), pRank: wilcoxon(diffs), lost,
      };
      if (perLemma(type)) {
        const found = (run: typeof runA) => (q: Query) => ((run.rank.get(q.id) ?? 0) > 0 ? 1 : 0);
        const ma = macroByLemma(qs, found(runA)), mb = macroByLemma(qs, found(runB));
        cell.macro = { a: ma.mean, b: mb.mean, lemmas: ma.lemmas };
      }
      cells.push(cell);
    }
  }
}

const q = bh(cells.flatMap((c) => [c.pFound, c.pRank]));
cells.forEach((c, i) => {
  c.qFound = q[2 * i]!;
  c.qRank = q[2 * i + 1]!;
  const dRecall = c.recallB - c.recallA, dMrr = c.mrrB - c.mrrA;
  c.blocked = (c.qFound < ALPHA && dRecall <= -MIN_DROP) || (c.qRank < ALPHA && dMrr <= -MIN_DROP);
  c.up = (c.qFound < ALPHA && dRecall > 0) || (c.qRank < ALPHA && dMrr > 0);
  c.down = (c.qFound < ALPHA && dRecall < 0) || (c.qRank < ALPHA && dMrr < 0);
});

// --- output -----------------------------------------------------------------------

const pts = (x: number) => (100 * x).toFixed(0);
const delta = (x: number) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`;
const lines: string[] = [];
const out = (s = "") => lines.push(s);
const blocked = cells.filter((c) => c.blocked);
const engines = ENGINES.map((e) => e.name);

out(`# ${nameA} → ${nameB} (${split} split${SET ? `, ${SET} set` : ""})`);
out();
out(`Generated by \`node bench/compare.ts ${nameA} ${nameB} --split ${split}${SET ? ` --set ${SET}` : ""}\`. ${cells.length} cells, ${2 * cells.length} tests, BH-adjusted.`);
out(`A cell blocks when q < ${ALPHA} **and** recall or MRR drops by ≥ ${100 * MIN_DROP} points. ▲/▼ = significant change (q < ${ALPHA}); ✖ = blocks.`);
if (missing.length) out(`Missing or stale runs (not compared): ${missing.join(", ")}.`);
out();
out(`**Verdict: ${blocked.length ? `BLOCKED by ${blocked.length} cell(s)` : "no blocking regression"}.** ` +
  `Significant up: ${cells.filter((c) => c.up).length}; significant down: ${cells.filter((c) => c.down).length}.`);
out();

for (const corpus of corpora) {
  const cs = cells.filter((c) => c.corpus === corpus);
  if (!cs.length) continue;
  out(`## ${corpus}: recall@10, ${nameA} → ${nameB}`);
  out();
  out(`| type | n | ${engines.join(" | ")} | coverage |`);
  out(`|---|---:|${engines.map(() => "---:").join("|")}|---:|`);
  for (const type of types) {
    const row = cs.filter((c) => c.type === type);
    if (!row.length) continue;
    const cov = coverage.find((x) => x.corpus === corpus && x.type === type);
    out(`| ${type} | ${row[0]!.n} | ${engines.map((e) => {
      const c = row.find((x) => x.engine === e);
      if (!c) return "–";
      const mark = c.blocked ? " ✖" : c.up ? " ▲" : c.down ? " ▼" : "";
      return `${pts(c.recallA)}→${pts(c.recallB)}${mark}`;
    }).join(" | ")} | ${cov ? `${pts(cov.a)}→${pts(cov.b)}` : "–"} |`);
  }
  out();
  out(`MRR@10 ×100:`);
  out();
  out(`| type | ${engines.join(" | ")} |`);
  out(`|---|${engines.map(() => "---:").join("|")}|`);
  for (const type of types) {
    const row = cs.filter((c) => c.type === type);
    if (!row.length) continue;
    out(`| ${type} | ${engines.map((e) => { const c = row.find((x) => x.engine === e); return c ? `${pts(c.mrrA)}→${pts(c.mrrB)}` : "–"; }).join(" | ")} |`);
  }
  out();
  const verbs = cs.filter((c) => c.macro);
  if (verbs.length) {
    out(`Per-lemma macro recall (each lemma weighted equally):`);
    out();
    out(`| type | lemmas | ${engines.join(" | ")} |`);
    out(`|---|---:|${engines.map(() => "---:").join("|")}|`);
    for (const type of types.filter(perLemma)) {
      const row = verbs.filter((c) => c.type === type);
      if (!row.length) continue;
      out(`| ${type} | ${row[0]!.macro!.lemmas} | ${engines.map((e) => { const c = row.find((x) => x.engine === e); return c ? `${pts(c.macro!.a)}→${pts(c.macro!.b)}` : "–"; }).join(" | ")} |`);
    }
    out();
  }
}
if (SET && subtypeRows.length) {
  // Unpaired recall by subtype (n is small per cell: read as a direction, not a test).
  out(`## By subtype: recall@10, ${nameA} → ${nameB} (all corpora)`);
  out();
  out(`| type | subtype | n | ${engines.join(" | ")} |`);
  out(`|---|---|---:|${engines.map(() => "---:").join("|")}|`);
  const keys = [...new Set(subtypeRows.map((r) => `${r.q.type}\t${r.q.subtype ?? ""}`))].sort();
  for (const key of keys) {
    const [type, subtype] = key.split("\t") as [string, string];
    const rows = subtypeRows.filter((r) => r.q.type === type && (r.q.subtype ?? "") === subtype);
    const n = rows.filter((r) => r.engine === engines[0]).length;
    out(`| ${type} | ${subtype} | ${n} | ${engines.map((e) => {
      const rs = rows.filter((r) => r.engine === e);
      return rs.length ? `${pts(rs.filter((r) => r.a).length / rs.length)}→${pts(rs.filter((r) => r.b).length / rs.length)}` : "–";
    }).join(" | ")} |`);
  }
  out();
}
out(`Orama: ${ORAMA_NOTE}`);
out();

// --- query rescue ---------------------------------------------------------------------

const rescueNames = SET ? [] : [nameA, nameB].filter((n) => configByName(n).fa?.rescue);
if (rescueNames.length) {
  const pct1 = (x: number, n: number) => (n ? (100 * x / n).toFixed(1) : "–");
  const median = (xs: number[], p: number) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : 0;
  out("## Query rescue");
  out();
  out(`Notice rate: share of queries searched as a fix instead of as typed (${rescueNames.join(", ")}). On rows spelled correctly it should be ≈ 0.`);
  out();
  for (const corpus of corpora) {
    const queries = splitQueries(corpus, split);
    const byType = new Map<string, Query[]>();
    for (const q of queries) byType.set(q.type, [...(byType.get(q.type) ?? []), q]);
    for (const name of rescueNames) {
      const runs = new Map(engines.map((e) => [e, loadRun(corpus, e, name, split)] as const));
      if (![...runs.values()].some((r) => r?.fixed)) continue;
      out(`### ${corpus}: notice rate %, ${name}`);
      out();
      out(`| type | n | ${engines.join(" | ")} |`);
      out(`|---|---:|${engines.map(() => "---:").join("|")}|`);
      for (const type of types) {
        const qs = byType.get(type) ?? [];
        if (qs.length < MIN_N) continue;
        out(`| ${type} | ${qs.length} | ${engines.map((e) => { const f = runs.get(e)?.fixed; return f ? pct1(qs.filter((q) => f.get(q.id)).length, qs.length) : "–"; }).join(" | ")} |`);
      }
      out();
      const weak = engines.flatMap((e) => { const b = runs.get(e)?.bytes; return b ? [[e, [...b.values()].filter((x) => x > 0)] as const] : []; }).filter(([, xs]) => xs.length);
      if (weak.length) {
        out(`Word bytes per weak query that needed pieces (gzipped, a cold visitor: manifest + pieces): ${weak.map(([e, xs]) => `${e} median ${(median(xs, 0.5) / 1024).toFixed(1)} KB, p95 ${(median(xs, 0.95) / 1024).toFixed(1)} KB (${xs.length} queries)`).join("; ")}.`);
        out();
      }
    }
    // The extra set: false fixes (no target) and typo-uniform (recall, paired).
    const setA = new Map(engines.map((e) => [e, loadRun(corpus, e, nameA, split, "rescue")] as const));
    const setB = new Map(engines.map((e) => [e, loadRun(corpus, e, nameB, split, "rescue")] as const));
    if (![...setB.values()].some(Boolean)) continue;
    let set: Query[] = [];
    try { set = loadSet(corpus, "rescue").filter((q) => inSplit(q.base, split)); } catch { continue; }
    out(`### ${corpus}: extra set (bench/lib/rescue-sets.ts)`);
    out();
    out(`False-fix rows: % of queries rewritten, ${nameA} → ${nameB}. typo-uniform: recall@10, ${nameA} → ${nameB}.`);
    out();
    out(`| type | n | ${engines.join(" | ")} |`);
    out(`|---|---:|${engines.map(() => "---:").join("|")}|`);
    for (const type of SET_TYPES) {
      const qs = set.filter((q) => q.type === type);
      if (!qs.length) continue;
      const cell = (e: string) => {
        const a = setA.get(e), b = setB.get(e);
        const v = (r: typeof a) => !r ? "–" : type === "typo-uniform"
          ? pct1(qs.filter((q) => (r.rank.get(q.id) ?? 0) > 0).length, qs.length)
          : r.fixed ? pct1(qs.filter((q) => r.fixed!.get(q.id)).length, qs.length) : "0";
        return `${v(a)}→${v(b)}`;
      };
      out(`| ${type} | ${qs.length} | ${engines.map(cell).join(" | ")} |`);
    }
    out();
  }
}

if (blocked.length) {
  out("## Blocking cells");
  out();
  out("| corpus | engine | type | n | recall | MRR | lost/gained | q (found) | q (rank) |");
  out("|---|---|---|---:|---|---|---|---:|---:|");
  for (const c of blocked) {
    out(`| ${c.corpus} | ${c.engine}${c.engine === "orama" ? " (quirk)" : ""} | ${c.type} | ${c.n} | ${delta(c.recallB - c.recallA)} | ${delta(c.mrrB - c.mrrA)} | ${c.b}/${c.c} | ${c.qFound!.toPrecision(2)} | ${c.qRank!.toPrecision(2)} |`);
  }
  out();
}

out("## Found → lost");
out();
out(`Every query that ${nameA} found and ${nameB} did not, with the engines that lost it.`);
out();
const lostBy = new Map<string, { q: Query; engines: string[] }>();
for (const c of cells) {
  for (const q of c.lost) {
    const e = lostBy.get(q.id) ?? { q, engines: [] };
    e.engines.push(c.engine);
    lostBy.set(q.id, e);
  }
}
const lostList = [...lostBy.values()].sort((a, b) => b.engines.length - a.engines.length || (a.q.id < b.q.id ? -1 : 1));
for (const corpus of corpora) {
  const ls = lostList.filter((l) => l.q.corpus === corpus);
  if (!ls.length) continue;
  out(`### ${corpus} (${ls.length})`);
  out();
  for (const { q, engines: es } of ls) out(`- \`${q.id}\` «${q.text}» — ${es.join(", ")}`);
  out();
}

mkdirSync(new URL("results/compare/", import.meta.url), { recursive: true });
const file = new URL(`results/compare/${nameA}--${nameB}${SET ? `.${SET}` : ""}.${split}.md`, import.meta.url);
writeFileSync(file, lines.join("\n"));

if (!values.quiet) {
  console.log(`${nameA} → ${nameB} (${split}${SET ? `, ${SET} set` : ""}): ${cells.length} cells; up ${cells.filter((c) => c.up).length}, down ${cells.filter((c) => c.down).length}, blocked ${blocked.length}; ${lostList.length} queries found→lost`);
  for (const c of blocked) console.log(`  BLOCK ${c.corpus} ${c.engine} ${c.type}: recall ${delta(c.recallB - c.recallA)}, MRR ${delta(c.mrrB - c.mrrA)} (lost ${c.b}, gained ${c.c})`);
  console.log(`wrote ${file.pathname.split("/fa-search/")[1]}`);
}
process.exitCode = blocked.length ? 1 : 0;
