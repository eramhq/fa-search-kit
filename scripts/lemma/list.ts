/**
 * Model C, the control: a plain word → edit list, as many of the most frequent
 * words that fire as fit the byte budget; every other word defers. Answers "is a
 * model better than more words?".
 *
 * Serialized as `label:word,word,…` groups under the label line.
 */
import { DEFER } from "./edit.ts";
import type { Example } from "./examples.ts";
import { gzipBytes, inventory, type Guess, type Model } from "./model.ts";

export function trainList(examples: Example[], budget: number): Model {
  const labels = inventory(examples);
  const index = new Map(labels.map((l, i) => [l, i]));
  const fires = examples.filter((e) => e.label !== DEFER && index.has(e.label)).sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1));
  // Binary search on how many of the most frequent fires fit.
  let lo = 0, hi = fires.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (gzipBytes(serialize(labels, fires.slice(0, mid), index)) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return decodeList(serialize(labels, fires.slice(0, lo), index));
}

function serialize(labels: string[], fires: Example[], index: Map<string, number>): string {
  const groups = new Map<number, string[]>();
  for (const e of fires) groups.set(index.get(e.label)!, [...(groups.get(index.get(e.label)!) ?? []), e.word]);
  return labels.map((l) => l.replaceAll("|", "/")).join(";") + "\n" +
    [...groups].sort((a, b) => a[0] - b[0]).map(([y, ws]) => `${y}:${ws.sort().join(",")}`).join("\n");
}

export function decodeList(data: string): Model {
  const [head, ...lines] = data.split("\n");
  const labels = head!.split(";").map((l) => l.replaceAll("/", "|"));
  const table = new Map<string, number>();
  for (const line of lines) {
    const c = line.indexOf(":");
    if (c < 0) continue;
    const y = Number(line.slice(0, c));
    for (const w of line.slice(c + 1).split(",")) table.set(w, y);
  }
  return {
    kind: "list", labels, data,
    predict: (w: string): Guess => { const y = table.get(w); return y === undefined ? { label: DEFER, conf: 1 } : { label: labels[y]!, conf: 1 }; },
  };
}
