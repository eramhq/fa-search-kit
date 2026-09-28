/**
 * Model A: suffix rules with exceptions (LemmaGen / ripple-down rules style).
 *
 * A trie over each word's endings, read from the end («...ات», «...لات», «...ملات»),
 * and "^word" for the whole word. Each node holds the weighted label counts of the
 * training words with that ending, overall and per prefix tag (none/ب/ن/می/نمی).
 * A node becomes a rule only where its majority label differs from what its parent
 * rule already predicts, with enough support and gain; a tag-specific rule only where
 * the tag's majority differs from the untagged prediction. Prediction: the longest
 * ending with a rule, preferring the word's tag at equal length.
 * Confidence: purity × support / (support + 2), stored in 4 levels.
 *
 * Serialized as `label|tag|level:ending,ending,…` groups, one per line.
 */
import { DEFER } from "./edit.ts";
import type { Example } from "./examples.ts";
import { inventory, TAGS, tagOf, type Guess, type Model } from "./model.ts";

export interface TreeOptions {
  /** A rule needs this much weight at its node… */
  minSupport: number;
  /** …and must get this much more weight right than its parent. */
  minGain: number;
  /** Longest ending considered (letters; the whole word is always a candidate). */
  maxDepth: number;
}

const LEVELS = [0.5, 0.7, 0.85, 0.95];
const levelOf = (c: number) => LEVELS.reduce((l, x, i) => (c >= x ? i : l), 0);
const confOf = (l: number) => [0.5, 0.75, 0.9, 0.97][l]!;

interface Node { all: Map<number, number>; tag: Map<string, Map<number, number>>; kids: Map<string, Node> }
const node = (): Node => ({ all: new Map(), tag: new Map(), kids: new Map() });
const add = (m: Map<number, number>, k: number, w: number) => m.set(k, (m.get(k) ?? 0) + w);
const total = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const best = (m: Map<number, number>) => [...m].reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a), [0, -1] as [number, number]);

export function trainTree(examples: Example[], o: TreeOptions): Model {
  const labels = inventory(examples);
  const index = new Map(labels.map((l, i) => [l, i]));
  const root = node();
  for (const e of examples) {
    const y = index.get(e.label) ?? 0;
    const t = tagOf(e.word);
    const path = [...[...e.word].reverse().slice(0, o.maxDepth)];
    const keys = e.word.length <= o.maxDepth ? [...path, "^"] : path;
    let n = root;
    const visit = (x: Node) => {
      add(x.all, y, e.weight);
      const m = x.tag.get(t) ?? new Map();
      add(m, y, e.weight);
      x.tag.set(t, m);
    };
    visit(n);
    for (const k of keys) {
      let c = n.kids.get(k);
      if (!c) { c = node(); n.kids.set(k, c); }
      n = c;
      visit(n);
    }
  }

  // Rules: ending (as written) + tag ("*" = any) → label, confidence level.
  const rules = new Map<string, [number, number]>();
  const conf = (m: Map<number, number>) => {
    const [, w] = best(m), s = total(m);
    return (w / s) * (s / (s + 2));
  };
  const walk = (n: Node, ending: string, parent: Map<string, number>) => {
    const here = new Map(parent);
    // Untagged rule. A deeper untagged rule wins over a shallower tagged one (the decoder
    // takes the longest ending first), so it resets every tag's prediction.
    const [y, wy] = best(n.all);
    const inherited = parent.get("*") ?? 0;
    if (ending === "") rules.set(`*\t`, [y, levelOf(conf(n.all))]), here.set("*", y);
    else if (total(n.all) >= o.minSupport && y !== inherited && wy - (n.all.get(inherited) ?? 0) >= o.minGain) {
      rules.set(`*\t${ending}`, [y, levelOf(conf(n.all))]);
      here.clear();
      here.set("*", y);
    }
    // Tag rules, against what the chain predicts here for that tag.
    for (const t of TAGS) {
      const m = n.tag.get(t);
      if (!m || !t) continue;
      const [yt, wt] = best(m);
      const cur = here.get(t) ?? here.get("*")!;
      if (total(m) >= o.minSupport && yt !== cur && wt - (m.get(cur) ?? 0) >= o.minGain) {
        rules.set(`${t}\t${ending}`, [yt, levelOf(conf(m))]);
        here.set(t, yt);
      }
    }
    for (const [k, c] of [...n.kids].sort((a, b) => (a[0] < b[0] ? -1 : 1))) walk(c, k === "^" ? "^" + ending : k + ending, here);
  };
  walk(root, "", new Map([["*", 0]]));

  // Serialize: group endings by label, tag and level.
  const groups = new Map<string, string[]>();
  for (const [key, [y, l]] of [...rules].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [t, ending] = key.split("\t") as [string, string];
    const g = `${y}|${t}|${l}`;
    groups.set(g, [...(groups.get(g) ?? []), ending]);
  }
  const data = labels.map((l) => l.replaceAll("|", "/")).join(";") + "\n" + [...groups].map(([g, es]) => `${g}:${es.join(",")}`).join("\n");
  return decodeTree(data);
}

/** The decoder that would ship: the serialized rules → predict. */
export function decodeTree(data: string): Model {
  const [head, ...lines] = data.split("\n");
  const labels = head!.split(";").map((l) => l.replaceAll("/", "|"));
  const rules = new Map<string, [number, number]>();
  let maxLen = 0;
  for (const line of lines) {
    const c = line.indexOf(":");
    const [y, t, l] = line.slice(0, c).split("|");
    for (const ending of line.slice(c + 1).split(",")) {
      rules.set(`${t}\t${ending}`, [Number(y), Number(l)]);
      maxLen = Math.max(maxLen, ending.length);
    }
  }
  return {
    kind: "tree", labels, data,
    predict(w: string): Guess {
      const t = tagOf(w);
      const cands = ["^" + w];
      for (let k = Math.min(w.length, maxLen); k >= 0; k--) cands.push(w.slice(w.length - k));
      for (const ending of cands) {
        const r = (t && rules.get(`${t}\t${ending}`)) || rules.get(`*\t${ending}`);
        if (r) return { label: labels[r[0]] ?? DEFER, conf: confOf(r[1]) };
      }
      return { label: DEFER, conf: 1 };
    },
  };
}
