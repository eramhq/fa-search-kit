/**
 * What every lemma model shares: the label inventory (≤ 255 edits + DEFER), the
 * prefix tag, the serialized form and its size, and the bridge to the lexicon
 * wrapper (scripts/lemma/wrap.ts).
 */
import { gzipSync } from "node:zlib";
import { DEFER, parseEdit } from "./edit.ts";
import type { Example } from "./examples.ts";
import type { Predictor } from "./wrap.ts";

export interface Guess { label: string; conf: number }

export interface Model {
  kind: "tree" | "linear" | "list";
  /** The labels a class index stands for (index 0 is DEFER). */
  labels: string[];
  /** The model as it would ship: one string for data.ts. */
  data: string;
  predict(word: string): Guess;
}

/** The verb prefixes the 5-way split sees, longest first. */
export const TAGS = ["نمی", "می", "ن", "ب", ""] as const;
export const tagOf = (w: string) => TAGS.find((t) => w.startsWith(t) && w.length > t.length + 1) ?? "";

/** The most frequent labels (by weight), DEFER first. Rarer labels cannot be predicted. */
export function inventory(examples: Example[], max = 255): string[] {
  const w = new Map<string, number>();
  for (const e of examples) if (e.label !== DEFER) w.set(e.label, (w.get(e.label) ?? 0) + e.weight);
  return [DEFER, ...[...w].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max).map(([l]) => l)];
}

export const gzipBytes = (s: string) => gzipSync(Buffer.from(s, "utf8"), { level: 9 }).length;

/** A model as the lexicon wrapper's predictor: DEFER and unknown labels give nothing. */
export function predictorOf(model: Pick<Model, "predict">): Predictor {
  const edits = new Map<string, ReturnType<typeof parseEdit>>();
  return (w) => {
    const g = model.predict(w);
    if (g.label === DEFER) return undefined;
    let e = edits.get(g.label);
    if (!e) { e = parseEdit(g.label); edits.set(g.label, e); }
    return { edit: e, conf: g.conf };
  };
}
