/**
 * The lemma query set (Phase 4b), kept out of the main query files so every cached
 * main run stays valid. Written by bench/lemma-queries.ts to
 * bench/data/queries/<corpus>.lemma.jsonl; run with `node bench/run.ts --set lemma`.
 *
 * Each canonical query of the main set (supplementary targets included) gets at most one variant per
 * type: one token swapped for another form of its gold lemma in the UD treebanks
 * (CC BY-SA, evaluation only), so the forms that belong together come from human
 * annotation, not from the analyzer or Hazm.
 * - morph-ud-noun / morph-ud-adj: a noun or adjective (both treebanks);
 * - morph-ud-verb: a verb, affirmative forms only (PerDT; its lemma keeps the preverb,
 *   so «برخاست» is not a form of «خاست»).
 * The token must have exactly one lemma in UD, tagged with that class in most of its
 * uses; so must the replacement, which must also be attested in the raw-source
 * vocabulary and differ by more than a half-space. The subtype names the ending that
 * separates the two forms (ezafe ی, ات, گان, ان/ین, comparative, clitic…), with a
 * leading "-" when the query drops it (the page has the inflected form). Pairs that
 * differ only by the ها plural are left to the main set's plural rows.
 * `unseenUd` marks lemmas absent from UD's train files, which a UD-trained model
 * never saw.
 */
import type { Query } from "../queries.ts";
import type { CorpusName } from "../corpus.ts";
import { isArabicScript, rawTokens, standardTyping, ZWNJ } from "./persian.ts";
import { pick, rng, seedOf } from "./rng.ts";
import { isWord, loadTreebank, TREEBANKS } from "./ud.ts";

export const LEMMA_TYPES = ["morph-ud-noun", "morph-ud-adj", "morph-ud-verb"] as const;
type Cls = "noun" | "adj" | "verb";
const CLASS: Record<string, Cls> = { NOUN: "noun", ADJ: "adj", VERB: "verb" };

/** Spelling-noise fold for keys (as bench/conflation.ts folds gold lemmas); independent of the analyzer. */
export const udKey = (w: string) =>
  standardTyping(w).replace(/^‌+|‌+$/g, "").replaceAll("ۀ", "ه").replace(/[أإ]/g, "ا").replaceAll("ؤ", "و").replaceAll("ئ", "ی");
const bare = (w: string) => w.replaceAll(ZWNJ, "");

const CLITIC = /^(?:م|ت|ش|مان|تان|شان|یم|یت|یش|یمان|یتان|یشان|ام|ات|اش)$/;
/** The ending that separates a form from its lemma (bare forms), or "other". */
export function ending(word: string, lemma: string): string {
  const classify = (s: string) => {
    if (s === "") return "same form";
    if (/^(?:ی|ای|یی)$/.test(s)) return "ezafe/indefinite ی";
    if (/^ها(?:ی|یی)?/.test(s)) return "ها plural";
    if (s === "ات") return "ات plural";
    if (s === "گان") return "گان plural";
    if (s === "ان" || s === "یان") return "ان/یان plural";
    if (s === "ین") return "ین plural";
    if (/^تر(?:ین)?$/.test(s)) return "comparative";
    if (CLITIC.test(s)) return "clitic";
    return "other ending";
  };
  if (word.startsWith(lemma)) return classify(word.slice(lemma.length));
  // حمله → حملات, نویسنده → نویسندگان: the lemma's final ه goes.
  if (lemma.endsWith("ه") && word.startsWith(lemma.slice(0, -1))) {
    const s = word.slice(lemma.length - 1);
    return s === "ات" ? "ات plural" : s === "گان" ? "گان plural" : classify(s);
  }
  return "other";
}

export interface UdLexemes {
  /** Form key → its one lemma (`<class>:<lemma>`). */
  lemmaOf: Map<string, string>;
  /** Lemma → its forms, as written in UD (standard typing). */
  forms: Map<string, string[]>;
  /** Lemmas seen in UD's train files. */
  inTrain: Set<string>;
}

export function udLexemes(): UdLexemes {
  const lemmas = new Map<string, Set<string>>();
  const uses = new Map<string, number>(), classUses = new Map<string, number>();
  const spelling = new Map<string, string>();
  const inTrain = new Set<string>();
  for (const bank of TREEBANKS) {
    for (const split of ["train", "dev", "test"] as const) {
      for (const s of loadTreebank(bank, [split])) {
        for (const w of s.words) {
          if (!isWord(w)) continue;
          const key = udKey(w.form);
          uses.set(key, (uses.get(key) ?? 0) + 1);
          const cls = CLASS[w.upos];
          if (!cls || !w.lemma || (cls === "verb" && (bank !== "perdt" || /Polarity=Neg/.test(w.feats)))) continue;
          classUses.set(key, (classUses.get(key) ?? 0) + 1);
          let lemma = w.lemma;
          if (cls === "verb") {
            const orig = /(?:^|\|)OrigLemma=([^|]+)/.exec(w.misc)?.[1]?.split("#") ?? [];
            if (orig.length === 2 && orig[0] && orig[0] !== w.lemma && orig[1] === w.lemma) lemma = orig[0] + w.lemma;
          }
          const id = `${cls}:${bare(udKey(lemma))}`;
          if (split === "train") inTrain.add(id);
          const set = lemmas.get(key) ?? new Set();
          set.add(id);
          lemmas.set(key, set);
          if (!spelling.has(key)) spelling.set(key, standardTyping(w.form));
        }
      }
    }
  }
  const lemmaOf = new Map<string, string>();
  const forms = new Map<string, string[]>();
  for (const [key, set] of [...lemmas].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (set.size !== 1 || (classUses.get(key) ?? 0) < 0.5 * (uses.get(key) ?? 0)) continue;
    const lemma = [...set][0]!;
    lemmaOf.set(key, lemma);
    forms.set(lemma, [...(forms.get(lemma) ?? []), spelling.get(key)!]);
  }
  return { lemmaOf, forms, inTrain };
}

export function buildLemmaSet(corpus: CorpusName, canonical: Query[], ud: UdLexemes, vocab: Map<string, number>, stop: Set<string>): Query[] {
  const out: Query[] = [];
  for (const q of canonical) {
    const tokens = q.text.split(" ");
    for (const type of LEMMA_TYPES) {
      const cls = type.slice("morph-ud-".length);
      const random = rng(seedOf(`${q.base}/${type}`));
      const L0 = cls.length + 1;
      const subtypeOf = (from: string, to: string, L: string) => cls === "verb" ? "verb" : to === L ? `-${ending(from, L)}` : ending(to, L);
      const options: { i: number; lemma: string; alts: { f: string; subtype: string }[] }[] = [];
      tokens.forEach((t, i) => {
        if (!isArabicScript(t) || stop.has(t) || bare(t).length < 2) return;
        const lemma = ud.lemmaOf.get(udKey(t));
        if (!lemma?.startsWith(cls + ":")) return;
        const from = bare(udKey(t));
        const alts = (ud.forms.get(lemma) ?? [])
          .filter((f) => bare(udKey(f)) !== from && vocab.has(f) && !stop.has(f) && rawTokens(f).length === 1 && rawTokens(f)[0] === f)
          .map((f) => ({ f, subtype: subtypeOf(from, bare(udKey(f)), lemma.slice(L0)) }))
          // The ها plural is the main set's plural-add/drop row.
          .filter((a) => !/^-?ها plural$/.test(a.subtype));
        if (alts.length) options.push({ i, lemma, alts });
      });
      if (!options.length) continue;
      const { i, lemma, alts } = pick(random, options);
      const { f: alt, subtype } = pick(random, alts);
      out.push({
        id: `${q.base}/${type}`, corpus, base: q.base, target: q.target, type, subtype, lemma,
        text: tokens.map((t, j) => (j === i ? alt : t)).join(" "),
        ...(ud.inTrain.has(lemma) ? {} : { unseenUd: true as const }),
      });
    }
  }
  return out;
}
