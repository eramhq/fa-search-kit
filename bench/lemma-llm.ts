/**
 * LLM labels for the lemma model (Phase 4b, label source L): two model families
 * label word types from our own vocabulary list, never UD or Wikipedia text.
 *
 *     node bench/lemma-llm.ts --dev                # 300 pair-dev words with UD answers (prompt development)
 *     node bench/lemma-llm.ts --bulk [--size 400]  # the labelling queue, in shards
 *     node bench/lemma-llm.ts --score <dir>        # each family against UD, per class
 *     node bench/lemma-llm.ts --merge <dir>        # agreement, κ, accepted labels, provenance
 *     node bench/lemma-llm.ts --active lm-tree,lm-linear   # CP2's active-learning queue
 *
 * Shard contract (bench/lemma-llm/prompt.md): <dir>/shard-NN.tsv (id, word, count) in,
 * <dir>/<family>/out-NN.jsonl out, one JSON row per word. Families: `luna` (Codex
 * gpt-6-luna, xhigh, in herdr panes) and `claude` (Claude subagents). A label counts only
 * when both families give the same term; disagreements defer. Everything under
 * bench/data/lemma/llm/ is gitignored and keyed by the prompt's hash, so the build
 * re-runs without new LLM calls; the provenance manifest and the stats are committed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { bare, lemmaSplit, lemmaTerm, refTerm, tokenOf, udExamples } from "./lib/lemma.ts";
import { rng, seedOf, shuffle } from "./lib/rng.ts";
import { spellingOf } from "../scripts/lib/mine.ts";
import { bareCount } from "../scripts/lemma/pairs.ts";
import { hazm } from "../scripts/lib/mine.ts";
import { loadSaved } from "../scripts/lemma/saved.ts";

export const LLM_DIR = new URL("data/lemma/llm/", import.meta.url);
const PROMPT = new URL("lemma-llm/prompt.md", import.meta.url);
export const promptHash = () => createHash("sha256").update(readFileSync(PROMPT)).digest("hex").slice(0, 12);
export const FAMILIES = ["luna", "claude"] as const;
const PASTS = new Set(hazm.map(([p]) => p));
/** The bar for accepted LLM merges (the plan): a class with ≥ 30 UD-checked merges under 95% right is dropped. */
const BAR = 0.95, MIN_CHECKS = 30;

export interface Reading { lemma: string; kind: string; neg?: boolean; share: number }
export interface LlmRow { id: number; word: string; readings: Reading[]; dominant: number | null; merge_ok: boolean; confident: boolean }
export interface Mined { word: string; target: string; verb: boolean; neg: boolean; cls: string; lemma: string; count: number; unsure?: true; split: string }

/** A label's term for a bare word: a target (verb or nominal), or "" to defer. */
export function labelOf(word: string, row: LlmRow | undefined): { target: string; verb: boolean; neg: boolean; lemma: string } | undefined {
  if (!row) return undefined;
  const r = row.dominant === null || row.dominant === undefined ? undefined : row.readings[row.dominant];
  if (!r || !row.merge_ok) return { target: "", verb: false, neg: false, lemma: word };
  const l = bare(tokenOf(r.lemma) ?? r.lemma);
  if (!l || (l === word && !r.neg)) return { target: "", verb: false, neg: false, lemma: word };
  if (r.kind === "verb") return { target: (r.neg ? "ن" : "") + l, verb: true, neg: !!r.neg, lemma: l };
  return { target: lemmaTerm(l), verb: false, neg: false, lemma: l };
}

export function loadMined(): Mined[] {
  return readFileSync(new URL("../mined.jsonl", LLM_DIR), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Mined);
}

export function readOut(dir: URL, family: string): Map<string, LlmRow> {
  const out = new Map<string, LlmRow>();
  const d = new URL(`${family}/`, dir);
  if (!existsSync(d)) return out;
  const shards = new Map<number, string>();
  for (const f of readdirSync(dir)) {
    const m = /^shard-(\d+)\.tsv$/.exec(f);
    if (!m) continue;
    for (const line of readFileSync(new URL(f, dir), "utf8").trim().split("\n")) {
      const [id, word] = line.split("\t");
      shards.set(Number(id), bare(word!));
    }
  }
  for (const f of readdirSync(d).filter((x) => x.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(new URL(f, d), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as LlmRow;
        const word = shards.get(Number(row.id));
        if (word !== undefined) out.set(word, row);
      } catch { /* a malformed row counts as missing */ }
    }
  }
  return out;
}

/** UD's answer for a bare word: its dominant target (≥ 90% of its uses), and fa-full's term. */
export function udAnswers(): Map<string, { target: string; base: string; upos: string }> {
  const by = new Map<string, Map<string, { n: number; base: string; upos: string }>>();
  for (const e of udExamples()) {
    const m = by.get(e.word) ?? new Map();
    const x = m.get(e.target) ?? { n: 0, base: e.base, upos: e.upos };
    x.n += e.count;
    m.set(e.target, x);
    by.set(e.word, m);
  }
  const out = new Map<string, { target: string; base: string; upos: string }>();
  for (const [w, m] of by) {
    const all = [...m].sort((a, b) => b[1].n - a[1].n);
    const total = all.reduce((s, x) => s + x[1].n, 0);
    if (all[0]![1].n >= 0.9 * total) out.set(w, { target: all[0]![0], base: all[0]![1].base, upos: all[0]![1].upos });
  }
  return out;
}

function writeShards(dir: URL, words: { word: string; count: number }[], size: number, set: string) {
  mkdirSync(dir, { recursive: true });
  const hashes: Record<string, string> = {};
  for (let i = 0; i * size < words.length; i++) {
    const name = `shard-${String(i).padStart(2, "0")}.tsv`;
    const text = words.slice(i * size, (i + 1) * size).map((w, j) => `${i * size + j}\t${spellingOf(w.word)}\t${w.count}`).join("\n") + "\n";
    writeFileSync(new URL(name, dir), text);
    hashes[name] = createHash("sha256").update(text).digest("hex").slice(0, 12);
  }
  writeFileSync(new URL("meta.json", dir), JSON.stringify({ set, prompt: promptHash(), created: new Date().toISOString().slice(0, 10), words: words.length, shards: hashes }, null, 1) + "\n");
  console.log(`wrote ${Object.keys(hashes).length} shards (${words.length} words) to ${dir.pathname}`);
}

/** The class of a mined word, for reports («unsure ezafe after consonant» → «ezafe after consonant»; every look-alike together). */
export const classOf = (m: Mined | undefined) => (!m ? "unmined" : m.cls.startsWith("lookalike") ? "look-alike" : m.cls.replace(/^unsure /, ""));

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      dev: { type: "boolean", default: false }, bulk: { type: "boolean", default: false },
      score: { type: "string" }, merge: { type: "string" }, size: { type: "string", default: "400" },
      active: { type: "string" }, max: { type: "string", default: "3000" },
    },
  });
  const mined = loadMined();
  const byWord = new Map(mined.map((m) => [m.word, m]));

  if (values.dev) {
    // 300 dev-lemma words UD answers, stratified: the LLM queue, look-alikes, verbs, lemmas and deferred forms.
    const ud = udAnswers();
    const pool = mined.filter((m) => m.split === "dev" && ud.has(m.word));
    const random = rng(seedOf("lemma-llm/dev"));
    const take = (f: (m: Mined) => boolean, n: number) => shuffle(random, pool.filter(f)).slice(0, n);
    const words = [
      ...take((m) => !!m.unsure, 150), ...take((m) => m.cls.startsWith("lookalike"), 50),
      ...take((m) => m.verb, 50), ...take((m) => m.cls === "lemma", 25), ...take((m) => !m.unsure && !m.verb && !m.cls.startsWith("lookalike") && m.cls !== "lemma", 25),
    ];
    writeShards(new URL(`dev-${promptHash()}/`, LLM_DIR), shuffle(random, words).map((m) => ({ word: m.word, count: m.count })), 300, "dev");
  }

  if (values.score) {
    const dir = new URL(`${values.score}/`, LLM_DIR);
    const ud = udAnswers();
    const lines = [`# LLM labels against UD (${values.score})`, "", "Term agreement with UD's dominant target. Fire = the label gives a term; defer = fa-full's term stands.", "",
      "| family | class | words | fires | fires right % | defers | defers right % |", "|---|---|---:|---:|---:|---:|---:|"];
    for (const family of [...FAMILIES, "both"]) {
      const outs = family === "both" ? FAMILIES.map((f) => readOut(dir, f)) : [readOut(dir, family)];
      if (!outs.every((o) => o.size)) continue;
      const stats = new Map<string, number[]>();
      const wrong: string[] = [];
      for (const [word] of outs[0]!) {
        const a = ud.get(word);
        if (!a) continue;
        const labels = outs.map((o) => labelOf(word, o.get(word)));
        if (labels.some((l) => !l)) continue;
        // Both families: agreement, else defer.
        const l = labels.every((x) => x!.target === labels[0]!.target) ? labels[0]! : { target: "" };
        const term = l.target || refTerm(spellingOf(word));
        const right = term === a.target;
        for (const cls of [classOf(byWord.get(word)), "all"]) {
          const s = stats.get(cls) ?? [0, 0, 0, 0, 0];
          s[0]!++;
          if (l.target) { s[1]!++; if (right) s[2]!++; } else { s[3]!++; if (right) s[4]!++; }
          stats.set(cls, s);
        }
        if (!right && l.target) wrong.push(`«${spellingOf(word)}» → ${l.target}, UD ${a.target}`);
        if (!right && !l.target) wrong.push(`«${spellingOf(word)}» defer (${refTerm(spellingOf(word))}), UD ${a.target}`);
      }
      const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(1) : "–");
      for (const [cls, s] of [...stats].sort((a, b) => b[1][0]! - a[1][0]!)) lines.push(`| ${family} | ${cls} | ${s[0]} | ${s[1]} | ${pct(s[2]!, s[1]!)} | ${s[3]} | ${pct(s[4]!, s[3]!)} |`);
      lines.push("", `${family}: disagreements with UD (${wrong.length}): ${wrong.join(" · ")}`, "");
    }
    writeFileSync(new URL("score.md", dir), lines.join("\n") + "\n");
    console.log(lines.join("\n"));
  }

  if (values.bulk) {
    // The queue (frozen prompt): mined candidates the miner could not decide or that
    // failed the UD bar (seen ≥ 10 times), look-alike negatives (≥ 20), every mined
    // comparative (a risky class, audited), and the unmined middle: words seen ≥ 100 times
    // that look inflected. The 300 prompt-development words are labelled already.
    const devWords = new Set<string>();
    for (const f of readdirSync(LLM_DIR).filter((d) => d.startsWith("dev-"))) for (const w of readOut(new URL(`${f}/`, LLM_DIR), "luna").keys()) devWords.add(w);
    const queue = new Map<string, number>();
    for (const m of mined) {
      if ((m.unsure && m.count >= 10) || (m.cls.startsWith("lookalike") && m.count >= 20) || (m.cls === "comparative" && m.target)) queue.set(m.word, m.count);
    }
    const INFLECTED = /(?:ی|ان|ات|گان|ین|تر|ترین|م|ش|مان|تان|شان|ها|های|هایی|ند|ید|یم|د)$/;
    for (const [w, n] of bareCount) {
      if (byWord.has(w) || n < 100 || w.length < 3 || !/^[\u0620-\u06FF]+$/.test(w)) continue;
      if (INFLECTED.test(w) || /^(?:ن?می|ب|ن)/.test(w)) queue.set(w, n);
    }
    for (const w of devWords) queue.delete(w);
    const words = shuffle(rng(seedOf("lemma-llm/bulk")), [...queue].sort((a, b) => (a[0] < b[0] ? -1 : 1))).map(([word, count]) => ({ word, count }));
    const dir = new URL(`bulk-${promptHash()}/`, LLM_DIR);
    writeShards(dir, words, Number(values.size), "bulk");
    writeFileSync(new URL("PROMPT.md", dir), readFileSync(PROMPT));
  }

  if (values.merge) merge(values.merge.split(","), byWord);

  if (values.active) {
    // CP2's one active-learning round: unlabelled vocabulary words (seen ≥ 20 times) where
    // two trained models disagree, or either is near its threshold; the most frequent first.
    const [a, b] = values.active.split(",").map((n) => loadSaved(n)) as [ReturnType<typeof loadSaved>, ReturnType<typeof loadSaved>];
    const labelled = new Set([...byWord.keys(), ...readFileSync(new URL("labels.jsonl", LLM_DIR), "utf8").trim().split("\n").map((l) => (JSON.parse(l) as { word: string }).word)]);
    const near = (g: { conf: number }, tau: number) => Math.abs(g.conf - tau) < 0.1;
    const picks: { word: string; count: number }[] = [];
    for (const [w, n] of bareCount) {
      if (n < 20 || labelled.has(w) || w.length < 3 || !/^[\u0620-\u06FF]+$/.test(w)) continue;
      const ga = a.model.predict(w), gb = b.model.predict(w);
      if (ga.label !== gb.label || near(ga, a.tau) || near(gb, b.tau)) picks.push({ word: w, count: n });
    }
    picks.sort((x, y) => y.count - x.count || (x.word < y.word ? -1 : 1));
    const words = shuffle(rng(seedOf("lemma-llm/active")), picks.slice(0, Number(values.max)));
    const dir = new URL(`active-${promptHash()}/`, LLM_DIR);
    writeShards(dir, words, Number(values.size), "active");
    writeFileSync(new URL("PROMPT.md", dir), readFileSync(PROMPT));
    console.log(`${picks.length} candidates; took the ${words.length} most frequent`);
  }
}

/** Cohen's κ for two raters' binary decisions. */
function kappa(pairs: [boolean, boolean][]): number {
  const n = pairs.length;
  if (!n) return NaN;
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pa = pairs.filter(([a]) => a).length / n, pb = pairs.filter(([, b]) => b).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/**
 * Merge the two families over the given shard directories: a label counts when both
 * give the same term; a disagreement defers. Writes the accepted labels
 * (bench/data/lemma/llm/labels.jsonl), the adjudication sample, the provenance
 * manifest and bench/results/lemma-labels.md.
 */
function merge(dirs: string[], byWord: Map<string, Mined>) {
  const ud = udAnswers();
  const rows: { word: string; target: string; verb: boolean; neg: boolean; lemma: string; count: number; cls: string; agree: boolean }[] = [];
  const disagreements: string[] = [];
  const perClass = new Map<string, { n: number; agree: number; fireBoth: number; kap: [boolean, boolean][]; udFire: number; udFireRight: number; udDefer: number; udDeferRight: number }>();
  const band = (c: number) => (c >= 1000 ? "≥1000" : c >= 100 ? "100–999" : c >= 20 ? "20–99" : "<20");
  const perBand = new Map<string, { fire: number; right: number }>();
  const manifest: Record<string, unknown> = {};
  const wrongUd: string[] = [];
  for (const name of dirs) {
    const dir = new URL(`${name}/`, LLM_DIR);
    manifest[name] = JSON.parse(readFileSync(new URL("meta.json", dir), "utf8"));
    const counts = new Map<string, number>();
    for (const f of readdirSync(dir).filter((x) => /^shard-\d+\.tsv$/.test(x))) {
      for (const line of readFileSync(new URL(f, dir), "utf8").trim().split("\n")) {
        const [, w, c] = line.split("\t");
        counts.set(bare(w!), Number(c));
      }
    }
    const [a, b] = FAMILIES.map((f) => readOut(dir, f)) as [Map<string, LlmRow>, Map<string, LlmRow>];
    for (const [word, count] of counts) {
      const la = labelOf(word, a.get(word)), lb = labelOf(word, b.get(word));
      if (!la || !lb) continue;
      // Agreement is on the term. The families sometimes give a verb's past stem with kind
      // "noun" or "function" (luna: «می‌کشد» → کشید, noun): a Hazm past stem read by either as a
      // verb is a verb.
      const agree = la.target === lb.target;
      const verb = agree && (la.verb || lb.verb) && PASTS.has(la.lemma);
      const l = !agree ? { target: "", verb: false, neg: false, lemma: word } : la.verb === verb ? la : lb.verb === verb ? lb : { ...la, verb };
      const cls = classOf(byWord.get(word));
      rows.push({ word, target: l.target, verb: l.verb, neg: l.neg, lemma: l.lemma, count, cls, agree });
      if (!agree) disagreements.push([spellingOf(word), la.target || "·", lb.target || "·", count].join("\t"));
      for (const k of [cls, "all"]) {
        const s = perClass.get(k) ?? { n: 0, agree: 0, fireBoth: 0, kap: [], udFire: 0, udFireRight: 0, udDefer: 0, udDeferRight: 0 };
        perClass.set(k, s);
        s.n++;
        if (agree) s.agree++;
        if (agree && l.target) s.fireBoth++;
        s.kap.push([!!la.target, !!lb.target]);
        const u = ud.get(word);
        if (u) {
          const term = l.target || refTerm(spellingOf(word));
          if (l.target) { s.udFire++; if (term === u.target) s.udFireRight++; else if (k === "all") wrongUd.push(`«${spellingOf(word)}» → ${l.target}, UD ${u.target}`); }
          else { s.udDefer++; if (term === u.target) s.udDeferRight++; }
          if (k === "all" && l.target) {
            const bb = perBand.get(band(count)) ?? { fire: 0, right: 0 };
            bb.fire++;
            if (term === u.target) bb.right++;
            perBand.set(band(count), bb);
          }
        }
      }
    }
  }
  const dropped = new Set([...perClass].filter(([k, x]) => k !== "all" && x.udFire >= MIN_CHECKS && x.udFireRight < BAR * x.udFire).map(([k]) => k));
  writeFileSync(new URL("labels.jsonl", LLM_DIR), rows.map((r) => JSON.stringify({ ...r, ...(dropped.has(r.cls) ? { dropped: true } : {}) })).join("\n") + "\n");
  const sample = shuffle(rng(seedOf("lemma-llm/adjudicate")), disagreements).slice(0, 200);
  writeFileSync(new URL("adjudicate.tsv", LLM_DIR), "word\tluna\tclaude\tcount\n" + sample.join("\n") + "\n");
  const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(1) : "–");
  const lines = ["# LLM lemma labels (label source L)", "",
    `Generated by \`node bench/lemma-llm.ts --merge ${dirs.join(",")}\`. Prompt \`bench/lemma-llm/prompt.md\`, hash ${promptHash()} (frozen after the 300-word development round). Families: luna = Codex gpt-6-luna, reasoning xhigh; claude = Claude subagents (claude-opus-5-5). Words: our vocabulary list only (bench/data/vocab.tsv), shown without context.`,
    "A label is accepted when both families give the same term (a merge to the same lemma term, or both defer); a disagreement defers. κ: Cohen's kappa on the two families' merge/defer decisions. UD: words also in UD whose uses agree on one target (≥ 90%).", "",
    "| class | words | agree % | κ (merge/defer) | accepted merges | UD-checked merges | right % | UD-checked defers | right % |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const [cls, s] of [...perClass].sort((x, y) => y[1].n - x[1].n)) {
    lines.push(`| ${cls} | ${s.n} | ${pct(s.agree, s.n)} | ${kappa(s.kap).toFixed(2)} | ${s.fireBoth} | ${s.udFire} | ${pct(s.udFireRight, s.udFire)} | ${s.udDefer} | ${pct(s.udDeferRight, s.udDefer)} |`);
  }
  lines.push("", `**Dropped** (accepted merges under ${100 * BAR}% right on ≥ ${MIN_CHECKS} UD checks; the class is left out of the L labels entirely): ${[...dropped].join(", ") || "none"}.`);
  lines.push("", "Accepted merges against UD by frequency band (word count in the vocabulary):", "", "| band | UD-checked merges | right % |", "|---|---:|---:|");
  for (const k of ["≥1000", "100–999", "20–99", "<20"]) { const x = perBand.get(k); if (x) lines.push(`| ${k} | ${x.fire} | ${pct(x.right, x.fire)} |`); }
  lines.push("", `Accepted merges UD disagrees with (${wrongUd.length}): ${wrongUd.slice(0, 150).join(" · ")}`, "");
  writeFileSync(new URL("results/lemma-labels.md", import.meta.url), lines.join("\n"));
  writeFileSync(new URL("results/lemma-llm-manifest.json", import.meta.url), JSON.stringify({
    prompt: { file: "bench/lemma-llm/prompt.md", sha256_12: promptHash() },
    families: { luna: "OpenAI gpt-6-luna via Codex CLI 0.158.0, model_reasoning_effort=xhigh, one fresh session per shard (bench/lemma-llm/run-luna.sh)", claude: "Anthropic claude-opus-5-5 via Claude Code subagents, one per shard" },
    input: "word types from bench/data/vocab.tsv (our counts over the raw benchmark sources), no sentence context",
    acceptance: "both families give the same term; disagreement defers",
    labelled: rows.length, dropped: [...dropped], disagreements: disagreements.length, shards: manifest,
  }, null, 1) + "\n");
  console.log(lines.slice(0, 40).join("\n"));
}
