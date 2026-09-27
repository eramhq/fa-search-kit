/**
 * Read the UD Persian treebanks (Seraji, PerDT) fetched by bench/fetch.ts.
 * CC BY-SA 4.0: evaluation only, never bundled.
 *
 * A "word" here is what a person types between spaces: a multiword token
 * («ماتمش» = ماتم + ش) counts once, with the lemma and tag of its first part
 * (the host). Lemmas are hand-checked. PerDT verb lemmas are the past stem
 * («شد»); Seraji's are sometimes a different verb altogether (it lemmatizes the
 * passive auxiliary «شد» as «کرد»), so verb checks use PerDT.
 */
import { readFileSync } from "node:fs";
import { RAW } from "../fetch.ts";

export const TREEBANKS = ["seraji", "perdt"] as const;
export type Treebank = (typeof TREEBANKS)[number];

export interface UdWord {
  form: string;
  lemma: string;
  upos: string;
  feats: string;
  /** The MISC column (PerDT keeps OrigLemma=«در#یافت» there, with the preverb). */
  misc: string;
  /** False when the next word follows with no space (punctuation, mostly). */
  spaceAfter: boolean;
}

export interface UdSentence {
  id: string;
  text: string;
  words: UdWord[];
}

export function loadTreebank(bank: Treebank, splits: readonly string[] = ["train", "dev", "test"]): UdSentence[] {
  const out: UdSentence[] = [];
  for (const split of splits) {
    const raw = readFileSync(new URL(`ud/fa_${bank}-ud-${split}.conllu`, RAW), "utf8");
    for (const block of raw.split(/\n\n+/)) {
      const lines = block.split("\n");
      let id = "", text = "";
      const words: UdWord[] = [];
      let skipUntil = 0;
      for (const line of lines) {
        if (line.startsWith("# sent_id = ")) id = line.slice(12);
        else if (line.startsWith("# text = ")) text = line.slice(9);
        if (!line || line.startsWith("#")) continue;
        const f = line.split("\t");
        const num = f[0]!;
        const misc = f[9] ?? "";
        const spaceAfter = !/(^|\|)SpaceAfter=No(\||$)/.test(misc);
        const range = /^(\d+)-(\d+)$/.exec(num);
        if (range) {
          // Multiword token: the host's lemma and tag come on the next line.
          words.push({ form: f[1]!, lemma: "", upos: "", feats: "", misc, spaceAfter });
          skipUntil = Number(range[2]);
          continue;
        }
        if (num.includes(".")) continue; // empty nodes
        const n = Number(num);
        const last = words.at(-1);
        if (skipUntil && n <= skipUntil) {
          if (last && !last.lemma) { last.lemma = f[2]!; last.upos = f[3]!; last.feats = f[5]!; last.misc = misc; }
          if (n === skipUntil) skipUntil = 0;
          continue;
        }
        words.push({ form: f[1]!, lemma: f[2]!, upos: f[3]!, feats: f[5]!, misc, spaceAfter });
      }
      if (words.length) out.push({ id: `${bank}:${id}`, text, words });
    }
  }
  return out;
}

/** Letters only (no punctuation, digits or symbols): the words a stemmer should see. */
export const isWord = (w: UdWord) => /\p{L}/u.test(w.form) && w.upos !== "PUNCT" && w.upos !== "NUM" && w.upos !== "SYM";
