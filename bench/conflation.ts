/**
 * Conflation quality against hand-checked lemmas (UD Persian-Seraji and PerDT,
 * CC BY-SA, evaluation only). Independent of the query generator and of Hazm.
 *
 *     node bench/conflation.ts [--configs snowball,fa-standard,...] [--name conflation]
 *
 * Unit: distinct (word form, gold lemma) pairs of one treebank. Paice's indices:
 * - under-stemming UI = pairs of forms with the same lemma that get different
 *   terms / all same-lemma pairs;
 * - over-stemming OI = pairs of different forms with different lemmas that get
 *   the same term / all different-lemma pairs.
 * Raw Snowball is the baseline; the analyzer has to improve on it, not just match.
 * Also lists, per config, the most frequent wrong merges it adds over Snowball,
 * for review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { configByName } from "./configs.ts";
import { standardTyping } from "./lib/persian.ts";
import { isWord, loadTreebank, TREEBANKS, type Treebank } from "./lib/ud.ts";

const { values } = parseArgs({
  options: {
    configs: { type: "string", default: "snowball,fa-light,fa-standard" },
    name: { type: "string", default: "conflation" },
    examples: { type: "string", default: "25" },
  },
});
const names = ["none", ...values.configs!.split(",").filter((c) => c !== "none")];
const EXAMPLES = Number(values.examples);

interface Entry { form: string; lemma: string; upos: string; freq: number }

/**
 * Gold lemma labels carry spelling noise («برنامهٔ» and «برنامه», «زندگی‌», «اولِ»,
 * «رأی»/«رای») that would count as distinct lemmas. Fold it, with plain rules that
 * do not depend on the analyzers under test.
 */
const label = (lemma: string) =>
  standardTyping(lemma).replace(/^\u200C+|\u200C+$/g, "").replaceAll("ۀ", "ه").replace(/[أإ]/g, "ا").replaceAll("ؤ", "و").replaceAll("ئ", "ی");

/**
 * Gold lemmas, or "verb families": PerDT and Seraji give an infinitive («کردن») and
 * a participle used as an adjective («کرده») lemmas of their own, apart from the
 * verb («کرد»). Search wants them together (a searcher's «کردن» should find «کرد»),
 * so the second view folds a lemma into its verb when it is the verb's lemma + ن or + ه.
 */
function entries(bank: Treebank, families: boolean): Entry[] {
  const list = rawEntries(bank);
  if (!families) return list;
  const verbs = new Set(list.filter((e) => e.upos === "VERB").map((e) => e.lemma));
  const by = new Map<string, Entry>();
  for (const e of list) {
    const lemma = /[نه]$/.test(e.lemma) && verbs.has(e.lemma.slice(0, -1)) ? e.lemma.slice(0, -1) : e.lemma;
    const key = `${e.form}\t${lemma}`;
    const x = by.get(key);
    if (x) x.freq += e.freq;
    else by.set(key, { ...e, lemma });
  }
  return [...by.values()];
}

function rawEntries(bank: Treebank): Entry[] {
  const by = new Map<string, Entry>();
  for (const s of loadTreebank(bank)) {
    for (const w of s.words) {
      if (!isWord(w) || !w.lemma) continue;
      const lemma = label(w.lemma);
      const key = `${w.form}\t${lemma}`;
      const e = by.get(key);
      if (e) e.freq++;
      else by.set(key, { form: w.form, lemma, upos: w.upos, freq: 1 });
    }
  }
  return [...by.values()];
}

/** The term a config gives one word: the analyzer in query mode, or the bare form for "none". */
function termFn(name: string): (form: string) => string {
  if (name === "none") return (f) => f;
  const config = configByName(name);
  if (!config.analyzer) return (f) => f.toLowerCase();
  return (f) => config.analyzer!.analyze(f, "query").join(" ");
}

interface Scores {
  ui: number; oi: number; umt: number; dmt: number; wmt: number; dnt: number;
  byPos: Record<string, { umt: number; dmt: number }>;
  merges: Map<string, Entry[]>;
}

const pairs = (n: number) => (n * (n - 1)) / 2;

function score(list: Entry[], term: (f: string) => string): Scores {
  const terms = new Map<Entry, string>();
  for (const e of list) terms.set(e, term(e.form));
  // Under-stemming: within a lemma, pairs of forms whose terms differ.
  const byLemma = new Map<string, Entry[]>();
  for (const e of list) byLemma.set(e.lemma, [...(byLemma.get(e.lemma) ?? []), e]);
  let umt = 0, dmt = 0;
  const byPos: Scores["byPos"] = {};
  for (const group of byLemma.values()) {
    const counts = new Map<string, number>();
    for (const e of group) counts.set(terms.get(e)!, (counts.get(terms.get(e)!) ?? 0) + 1);
    const all = pairs(group.length);
    const same = [...counts.values()].reduce((s, n) => s + pairs(n), 0);
    umt += all - same;
    dmt += all;
    const pos = (byPos[group[0]!.upos] ??= { umt: 0, dmt: 0 });
    pos.umt += all - same;
    pos.dmt += all;
  }
  // Over-stemming: within a term, pairs with different lemmas and different forms.
  const byTerm = new Map<string, Entry[]>();
  for (const e of list) byTerm.set(terms.get(e)!, [...(byTerm.get(terms.get(e)!) ?? []), e]);
  let wmt = 0;
  const merges = new Map<string, Entry[]>();
  for (const [t, group] of byTerm) {
    if (group.length < 2) continue;
    const lemmas = new Map<string, number>(), forms = new Map<string, number>();
    for (const e of group) {
      lemmas.set(e.lemma, (lemmas.get(e.lemma) ?? 0) + 1);
      forms.set(e.form, (forms.get(e.form) ?? 0) + 1);
    }
    // All pairs − same-lemma pairs − same-form pairs (+ same both = 0: entries are distinct pairs).
    const w = pairs(group.length) - [...lemmas.values()].reduce((s, n) => s + pairs(n), 0) - [...forms.values()].reduce((s, n) => s + pairs(n), 0);
    if (w > 0) { wmt += w; merges.set(t, group); }
  }
  const total = list.length;
  const dnt = [...byLemma.values()].reduce((s, g) => s + g.length * (total - g.length), 0) / 2;
  return { ui: umt / dmt, oi: wmt / dnt, umt, dmt, wmt, dnt, byPos, merges };
}

const lines: string[] = [];
const out = (s = "") => lines.push(s);
const json: Record<string, Record<string, Omit<Scores, "merges">>> = {};

out("# Conflation against UD gold lemmas");
out();
out("Generated by `node bench/conflation.ts`. UD Persian-Seraji and PerDT (CC BY-SA 4.0, evaluation only), all splits.");
out("Unit: distinct (form, gold lemma) pairs. **UI** (under-stemming) = share of same-lemma form pairs left apart;");
out("**OI** (over-stemming) = share of different-lemma, different-form pairs merged (×10⁶ for readability).");
out("`none` = forms as written (no analysis). Seraji lemmatizes the passive «شد» as «کرد», so its verb UI has a floor.");
out();

for (const [bank, families] of TREEBANKS.flatMap((b) => [[b, false], [b, true]] as const)) {
  const list = entries(bank, families);
  const view = families ? `${bank}-families` : bank;
  json[view] = {};
  const scores = new Map<string, Scores>();
  for (const name of names) scores.set(name, score(list, termFn(name)));
  out(`## ${bank}${families ? ", verb families" : ", gold lemmas"} (${list.length.toLocaleString("en")} form–lemma pairs)`);
  out();
  out("| config | UI % | OI ×10⁶ | same-lemma pairs apart | wrong merges | UI NOUN | UI VERB | UI ADJ |");
  out("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const [name, s] of scores) {
    const { merges: _, ...rest } = s;
    json[view]![name] = rest;
    const pos = (p: string) => (s.byPos[p] ? (100 * s.byPos[p].umt / s.byPos[p].dmt).toFixed(1) : "–");
    out(`| ${name} | ${(100 * s.ui).toFixed(2)} | ${(1e6 * s.oi).toFixed(1)} | ${s.umt.toLocaleString("en")} | ${s.wmt.toLocaleString("en")} | ${pos("NOUN")} | ${pos("VERB")} | ${pos("ADJ")} |`);
  }
  out();
  const base = scores.get("snowball");
  if (!base || families) continue;
  // Wrong merges a config adds over Snowball: different-lemma, different-form
  // pairs it merges and Snowball keeps apart, grouped by the config's term.
  const baseTerm = termFn("snowball");
  for (const name of names.filter((n) => n !== "none" && n !== "snowball")) {
    const s = scores.get(name)!;
    const added: { term: string; entries: Set<Entry>; pairs: number; freq: number }[] = [];
    for (const [t, group] of s.merges) {
      const involved = new Set<Entry>();
      let n = 0;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]!, b = group[j]!;
          if (a.lemma === b.lemma || a.form === b.form || baseTerm(a.form) === baseTerm(b.form)) continue;
          involved.add(a); involved.add(b); n++;
        }
      }
      if (n) added.push({ term: t, entries: involved, pairs: n, freq: [...involved].reduce((x, e) => x + e.freq, 0) });
    }
    added.sort((a, b) => b.freq - a.freq);
    out(`### ${bank}: wrong merges ${name} adds over snowball (${added.reduce((x, a) => x + a.pairs, 0)} pairs in ${added.length} terms; top ${EXAMPLES} by frequency)`);
    out();
    for (const a of added.slice(0, EXAMPLES)) {
      const by = new Map<string, string[]>();
      for (const e of a.entries) by.set(e.lemma, [...(by.get(e.lemma) ?? []), e.form]);
      out(`- «${a.term}» (${a.freq}): ${[...by].map(([l, fs]) => `${l} ← ${fs.slice(0, 4).join("، ")}`).join(" | ")}`);
    }
    out();
  }
}

mkdirSync(new URL("results/", import.meta.url), { recursive: true });
writeFileSync(new URL(`results/${values.name}.md`, import.meta.url), lines.join("\n") + "\n");
writeFileSync(new URL(`results/${values.name}.json`, import.meta.url), JSON.stringify(json, null, 1) + "\n");
console.log(lines.filter((l) => l.startsWith("|") || l.startsWith("## ")).join("\n"));
