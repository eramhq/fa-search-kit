/**
 * Model B: a hashed character n-gram linear classifier (fastText style).
 *
 * Features of a word: its endings of 1–6 letters, its beginnings of 1–4, the prefix
 * tag, the tag × 2- and 3-letter ending, the whole word, and its length. Each is
 * hashed into `buckets` embedding rows of `dim` numbers; the word's vector is their
 * mean, and a dim × labels layer (plus bias) scores the labels. Trained with SGD on
 * the weighted softmax loss, fixed seed, then quantized to int8 (one scale per
 * matrix). Confidence = the winning label's softmax probability.
 *
 * Serialized as the label line, then `buckets,dim,labels,scaleE,scaleW,scaleB` and the
 * int8 weights in base64.
 */
import { DEFER } from "./edit.ts";
import type { Example } from "./examples.ts";
import { inventory, tagOf, type Guess, type Model } from "./model.ts";
import { rng, shuffle } from "../../bench/lib/rng.ts";

export interface LinearOptions { buckets: number; dim: number; epochs: number; lr: number; seed: number }

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function features(w: string, buckets: number): number[] {
  const f: string[] = [];
  for (let k = 1; k <= 6 && k <= w.length; k++) f.push("S" + w.slice(-k));
  for (let k = 1; k <= 4 && k < w.length; k++) f.push("P" + w.slice(0, k));
  const t = tagOf(w);
  f.push("T" + t, "X" + t + "|" + w.slice(-2), "Y" + t + "|" + w.slice(-3), "W" + w, "L" + Math.min(w.length, 12));
  return f.map((x) => fnv(x) % buckets);
}

export function trainLinear(examples: Example[], o: LinearOptions): Model {
  const labels = inventory(examples);
  const index = new Map(labels.map((l, i) => [l, i]));
  const C = labels.length, D = o.dim, B = o.buckets;
  const random = rng(o.seed);
  const E = new Float32Array(B * D).map(() => (random() - 0.5) * 0.2);
  const W = new Float32Array(D * C), b = new Float32Array(C);
  const data = examples.map((e) => ({ x: features(e.word, B), y: index.get(e.label) ?? 0, w: e.weight }));
  const maxW = Math.max(...data.map((d) => d.w));
  const h = new Float32Array(D), p = new Float32Array(C), gh = new Float32Array(D);
  let step = 0;
  const steps = o.epochs * data.length;
  for (let epoch = 0; epoch < o.epochs; epoch++) {
    for (const d of shuffle(random, data)) {
      const lr = o.lr * (1 - step++ / steps) * (d.w / maxW);
      h.fill(0);
      for (const i of d.x) for (let k = 0; k < D; k++) h[k]! += E[i * D + k]! / d.x.length;
      let max = -Infinity;
      for (let c = 0; c < C; c++) {
        let s = b[c]!;
        for (let k = 0; k < D; k++) s += h[k]! * W[k * C + c]!;
        p[c] = s;
        if (s > max) max = s;
      }
      let z = 0;
      for (let c = 0; c < C; c++) { p[c] = Math.exp(p[c]! - max); z += p[c]!; }
      gh.fill(0);
      for (let c = 0; c < C; c++) {
        const g = p[c]! / z - (c === d.y ? 1 : 0);
        if (Math.abs(g) < 1e-6) continue;
        b[c]! -= lr * g;
        for (let k = 0; k < D; k++) { gh[k]! += g * W[k * C + c]!; W[k * C + c]! -= lr * g * h[k]!; }
      }
      for (const i of d.x) for (let k = 0; k < D; k++) E[i * D + k]! -= lr * gh[k]! / d.x.length;
    }
  }
  const q = (a: Float32Array) => {
    let max = 1e-9;
    for (const x of a) if (Math.abs(x) > max) max = Math.abs(x);
    const scale = max / 127;
    return { scale, v: Int8Array.from(a, (x) => Math.round(x / scale)) };
  };
  const qe = q(E), qw = q(W), qb = q(b);
  const bytes = new Uint8Array(qe.v.length + qw.v.length + qb.v.length);
  bytes.set(new Uint8Array(qe.v.buffer), 0);
  bytes.set(new Uint8Array(qw.v.buffer), qe.v.length);
  bytes.set(new Uint8Array(qb.v.buffer), qe.v.length + qw.v.length);
  const head = [B, D, C, qe.scale, qw.scale, qb.scale].join(",");
  return decodeLinear(labels.map((l) => l.replaceAll("|", "/")).join(";") + "\n" + head + "\n" + Buffer.from(bytes).toString("base64"));
}

export function decodeLinear(data: string): Model {
  const [labelLine, head, b64] = data.split("\n") as [string, string, string];
  const labels = labelLine.split(";").map((l) => l.replaceAll("/", "|"));
  const [B, D, C, se, sw, sb] = head.split(",").map(Number) as [number, number, number, number, number, number];
  const bytes = new Int8Array(Uint8Array.from(Buffer.from(b64, "base64")).buffer);
  const E = bytes.subarray(0, B * D), W = bytes.subarray(B * D, B * D + D * C), b = bytes.subarray(B * D + D * C);
  const h = new Float64Array(D);
  return {
    kind: "linear", labels, data,
    predict(w: string): Guess {
      const x = features(w, B);
      h.fill(0);
      for (const i of x) for (let k = 0; k < D; k++) h[k]! += (E[i * D + k]! * se) / x.length;
      let best = 0, max = -Infinity;
      const s = new Float64Array(C);
      for (let c = 0; c < C; c++) {
        let v = b[c]! * sb;
        for (let k = 0; k < D; k++) v += h[k]! * W[k * C + c]! * sw;
        s[c] = v;
        if (v > max) { max = v; best = c; }
      }
      let z = 0;
      for (let c = 0; c < C; c++) z += Math.exp(s[c]! - max);
      return { label: labels[best] ?? DEFER, conf: 1 / z };
    },
  };
}
