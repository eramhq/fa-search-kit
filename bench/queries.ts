/**
 * Build known-item queries with variants for each corpus.
 *
 *     node bench/queries.ts
 *
 * For each sampled target document we build a canonical query from its title,
 * the way someone who knows the page would search for it:
 * - the title's content words, Persian before Latin/digits, rarest first, until the words pin the target down
 *   (at most MAX_TITLE_HITS titles contain them all);
 * - products always keep the head noun (the product type: «کفش», «کرم»);
 * - news always keeps a title-final verb, so verb variants have something to change.
 * Words keep their title order and spelling. Then every variant generator is tried
 * on the canonical tokens; the ones that apply become extra queries for the same
 * target. Output: bench/data/queries/<corpus>.jsonl.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CORPORA, loadCorpus, type CorpusName, type Doc } from "./corpus.ts";
import { RAW } from "./fetch.ts";
import { isArabicScript, rawTokens } from "./lib/persian.ts";
import { rng, seedOf, shuffle } from "./lib/rng.ts";
import { loadTreebank } from "./lib/ud.ts";
import { VARIANTS, type Ctx, type UdVerbs } from "./lib/variants.ts";
import { Verbs } from "./lib/verbs.ts";
import { loadVocab } from "./vocab.ts";
import { readFileSync } from "node:fs";

export interface Query {
  id: string;
  corpus: CorpusName;
  base: string;
  target: string;
  type: string;
  subtype?: string;
  /** Verb lemma changed by a verb variant (per-lemma averages). */
  lemma?: string;
  text: string;
  /** Extra target sampled only to fill a rare variant type; excluded from the canonical control row. */
  supplement?: true;
}

export const QUERY_DIR = new URL("data/queries/", import.meta.url);
const TARGETS_PER_CORPUS = 1000;
const MAX_QUERY_WORDS = 5;
const MAX_TITLE_HITS = 3;
/** ...and at most this many documents contain them anywhere, so the query is answerable. */
const MAX_TEXT_HITS = 50;
/**
 * Rare variant types (hamza, half-space) keep sampling targets until they reach this many queries.
 * 300, so each half of the dev/test split (bench/lib/split.ts) keeps about 150.
 */
const MIN_PER_TYPE = 300;
const SEED = 20260926;

export function loadQueries(corpus: CorpusName): Query[] {
  return readFileSync(new URL(`${corpus}.jsonl`, QUERY_DIR), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Query);
}

/** Inverted index over raw tokens: token → doc indices. */
function invertedIndex(docs: Doc[], text: (d: Doc) => string): Map<string, number[]> {
  const index = new Map<string, number[]>();
  docs.forEach((d, i) => {
    for (const t of new Set(rawTokens(text(d)))) {
      const list = index.get(t) ?? [];
      list.push(i);
      index.set(t, list);
    }
  });
  return index;
}

function hits(index: Map<string, number[]>, tokens: string[]): number {
  const lists = tokens.map((t) => index.get(t) ?? []).sort((a, b) => a.length - b.length);
  let current = new Set(lists[0]);
  for (const list of lists.slice(1)) {
    const next = new Set(list);
    current = new Set([...current].filter((x) => next.has(x)));
  }
  return current.size;
}

interface Indexes { title: Map<string, number[]>; text: Map<string, number[]> }

/** The canonical query tokens, and the position of the title-final verb among them (news). */
function canonicalQuery(corpus: CorpusName, doc: Doc, idx: Indexes, ctx: Ctx): { tokens: string[]; verbIndex?: number } | null {
  const index = idx.title;
  // Drop a trailing parenthetical like «(فیلم ۱۹۹۴)»: it disambiguates, nobody types it.
  const title = doc.title.replace(/\s*\([^)]*\)\s*$/, "");
  const tokens = rawTokens(title);
  const content = tokens.map((t, i) => ({ t, i })).filter(({ t }) => !ctx.stop.has(t) && t.replace(/\u200C/g, "").length >= 2);
  if (!content.some(({ t }) => isArabicScript(t))) return null;

  const chosen = new Set<number>();
  if (corpus === "products") chosen.add(content.find(({ t }) => isArabicScript(t))!.i);
  let verb: number | undefined;
  if (corpus === "news") {
    // The last word, or the one before a trailing auxiliary («گفته است»).
    const last = tokens.length - 1;
    const aux = tokens[last] === "است" || tokens[last] === "اند" ? 1 : 0;
    const i = last - aux;
    if (i >= 0 && ctx.verbs.analyze(tokens[i]!).some((f) => f.tense !== "inf")) { verb = i; chosen.add(i); }
  }
  const pinned = (words: string[]) => hits(index, words) <= MAX_TITLE_HITS && hits(idx.text, words) <= MAX_TEXT_HITS;
  // Persian words first, rarest first. Latin model codes and numbers are the rarest
  // tokens of all, but using them would let a query match on the code alone and
  // hide what the engine does with the Persian words; they are a last resort.
  const persianFirst = (t: string) => (isArabicScript(t) ? 0 : 1);
  const byRarity = content.slice().sort((a, b) =>
    persianFirst(a.t) - persianFirst(b.t) || (index.get(a.t)?.length ?? 0) - (index.get(b.t)?.length ?? 0));
  const words = () => [...chosen].sort((a, b) => a - b).map((i) => tokens[i]!);
  for (const { i } of byRarity) {
    if (chosen.size >= 1 && pinned(words()) && (corpus !== "news" || chosen.size >= 3)) break;
    if (chosen.size >= MAX_QUERY_WORDS) break;
    chosen.add(i);
  }
  const query = words();
  if (!pinned(query)) return null;
  const order = [...chosen].sort((a, b) => a - b);
  return { tokens: query, ...(verb !== undefined ? { verbIndex: order.indexOf(verb) } : {}) };
}

/**
 * PerDT's affirmative verb forms grouped by gold lemma (see verb-tense-ud in
 * lib/variants.ts). PerDT's lemma drops a preverb («دریافته» → یافت) but its
 * OrigLemma keeps it («در#یافت»), so the group key is preverb + lemma: دریافتن is
 * not a tense of یافتن. A form counts only if PerDT tags it VERB in most of its
 * uses («ده» is mostly "ten").
 */
function perdtVerbs(): UdVerbs {
  const lemmas = new Map<string, Set<string>>();
  const uses = new Map<string, number>(), verbUses = new Map<string, number>();
  for (const s of loadTreebank("perdt")) {
    for (const w of s.words) {
      uses.set(w.form, (uses.get(w.form) ?? 0) + 1);
      if (w.upos !== "VERB" || /Polarity=Neg/.test(w.feats) || !w.lemma) continue;
      verbUses.set(w.form, (verbUses.get(w.form) ?? 0) + 1);
      const orig = /(?:^|\|)OrigLemma=([^|]+)/.exec(w.misc)?.[1]?.split("#") ?? [];
      const preverb = orig.length === 2 && orig[0] !== w.lemma && orig[1] === w.lemma ? orig[0] : "";
      const key = preverb ? `${preverb}+${w.lemma}` : w.lemma;
      const set = lemmas.get(w.form) ?? new Set();
      set.add(key);
      lemmas.set(w.form, set);
    }
  }
  const lemmaOf = new Map<string, string>();
  const forms = new Map<string, string[]>();
  for (const [form, set] of [...lemmas].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (set.size !== 1 || (verbUses.get(form) ?? 0) < 0.5 * (uses.get(form) ?? 0)) continue;
    const lemma = [...set][0]!;
    lemmaOf.set(form, lemma);
    forms.set(lemma, [...(forms.get(lemma) ?? []), form]);
  }
  return { lemmaOf, forms };
}

if (import.meta.main) {
  mkdirSync(QUERY_DIR, { recursive: true });
  const vocab = loadVocab();
  const verbs = Verbs.load(new URL("hazm-verbs.dat", RAW));
  const stop = new Set(readFileSync(new URL("hazm-stopwords.dat", RAW), "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
  const udVerbs = perdtVerbs();

  for (const corpus of CORPORA) {
    const docs = await loadCorpus(corpus);
    const idx: Indexes = { title: invertedIndex(docs, (d) => d.title), text: invertedIndex(docs, (d) => `${d.title} ${d.body}`) };
    const counts = new Map<string, number>();
    const out: Query[] = [];
    let bases = 0;
    for (const doc of shuffle(rng(SEED), docs)) {
      const supplement = bases >= TARGETS_PER_CORPUS;
      if (supplement && VARIANTS.every(([type]) => type === "canonical" || (counts.get(type) ?? 0) >= MIN_PER_TYPE)) break;
      const baseCtx: Ctx = { random: rng(seedOf(doc.id)), vocab, verbs, stop, udVerbs };
      const canon = canonicalQuery(corpus, doc, idx, baseCtx);
      if (!canon) continue;
      const tokens = canon.tokens;
      if (canon.verbIndex !== undefined) baseCtx.verbIndex = canon.verbIndex;
      const base = `${corpus}-${bases}`;
      const canonical = tokens.join(" ");
      const found: Query[] = [];
      for (const [type, generate] of VARIANTS) {
        if (supplement && type !== "canonical" && (counts.get(type) ?? 0) >= MIN_PER_TYPE) continue;
        const ctx: Ctx = { ...baseCtx, random: rng(seedOf(`${doc.id}/${type}`)) };
        const v = generate(tokens, ctx);
        if (!v || (type !== "canonical" && v.text === canonical)) continue;
        found.push({
          id: `${base}/${type}`, corpus, base, target: doc.id, type, ...(v.subtype ? { subtype: v.subtype } : {}),
          ...(v.lemma ? { lemma: v.lemma } : {}),
          text: v.text, ...(supplement ? { supplement: true as const } : {}),
        });
      }
      if (supplement && found.length === 1) continue; // only the canonical: nothing rare here
      bases++;
      for (const q of found) {
        out.push(q);
        if (!q.supplement || q.type !== "canonical") counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
      }
    }
    writeFileSync(new URL(`${corpus}.jsonl`, QUERY_DIR), out.map((q) => JSON.stringify(q)).join("\n") + "\n");
    console.log(`${corpus}: ${bases} targets (${Math.max(0, bases - TARGETS_PER_CORPUS)} supplementary), ${out.length} queries`);
    console.log("  " + [...counts].map(([t, n]) => `${t} ${n}`).join(", "));
  }
}
