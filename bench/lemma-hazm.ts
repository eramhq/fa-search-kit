/**
 * Label source H (comparison only, never shipped): Hazm's lemmatizer over the same
 * words as the other sources. Hazm's lemmatizer uses its words list, whose
 * provenance (Bijankhan, GPL) is unchecked, so it only measures what a
 * dictionary lemmatizer would give.
 *
 *     uv venv --python 3.11 bench/data/lemma/hazm-venv && uv pip install --python bench/data/lemma/hazm-venv/bin/python hazm
 *     node bench/lemma-hazm.ts          # bench/data/lemma/hazm.jsonl
 *
 * Verbs come back as past#present («رفت#رو») without their negation; a form that
 * starts with ن where its past stem does not is read as negated.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { bare, lemmaTerm, tokenOf } from "./lib/lemma.ts";
import { spellingOf } from "../scripts/lib/mine.ts";
import { labels } from "../scripts/lemma/examples.ts";

const DIR = new URL("data/lemma/", import.meta.url);
const words = [...new Set([...labels("M+L"), ...labels("U")].map((p) => p.word))].sort();
const counts = new Map([...labels("M+L"), ...labels("U")].map((p) => [p.word, p.count]));
writeFileSync(new URL("hazm-in.txt", DIR), words.map(spellingOf).join("\n") + "\n");
execFileSync(new URL("hazm-venv/bin/python", DIR).pathname, ["-c", `
import sys
from hazm import Lemmatizer
l = Lemmatizer()
with open(sys.argv[1]) as f, open(sys.argv[2], "w") as o:
    for w in f.read().split("\\n"):
        if w: o.write(l.lemmatize(w) + "\\n")
`, new URL("hazm-in.txt", DIR).pathname, new URL("hazm-out.txt", DIR).pathname]);
const out = readFileSync(new URL("hazm-out.txt", DIR), "utf8").split("\n");
const rows: string[] = [];
words.forEach((word, i) => {
  const lemma = out[i] ?? "";
  if (lemma.includes("#")) {
    const past = bare(tokenOf(lemma.split("#")[0]!) ?? "");
    if (!past) return;
    const neg = word.startsWith("ن") && !past.startsWith("ن") && !word.startsWith(past);
    rows.push(JSON.stringify({ word, target: (neg ? "ن" : "") + past, verb: true, neg, lemma: past, count: counts.get(word) ?? 1, cls: "hazm verb" }));
  } else {
    const l = bare(tokenOf(lemma) ?? lemma);
    const merge = l && l !== word;
    rows.push(JSON.stringify({ word, target: merge ? lemmaTerm(l) : "", verb: false, neg: false, lemma: l || word, count: counts.get(word) ?? 1, cls: "hazm" }));
  }
});
writeFileSync(new URL("hazm.jsonl", DIR), rows.join("\n") + "\n");
console.log(`hazm: ${rows.length} words labelled`);
