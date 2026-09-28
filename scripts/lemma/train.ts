/**
 * Training and pair metrics for the lemma models (scripts/build-lemma.ts runs them).
 */
import { examples, DEFER, type Example, type Source } from "./examples.ts";
import { gzipBytes, type Model } from "./model.ts";
import { trainTree, type TreeOptions } from "./tree.ts";
import { trainLinear, type LinearOptions } from "./linear.ts";
import { trainList } from "./list.ts";

export function train(kind: Model["kind"], source: Source, budget: number, opts: Partial<TreeOptions & LinearOptions> & { without?: Set<string> } = {}): { model: Model; options: object; words: string[] } {
  // `without`: verb lemmas (past stems) held out, as the lexicon holds them out in the held-out arms.
  const ex = examples(source).filter((e) => e.split === "train" && !(opts.without && e.verbLemma && opts.without.has(e.verbLemma)));
  const words = ex.map((e) => e.word);
  if (kind === "list") return { model: trainList(ex, budget), options: {}, words };
  if (kind === "linear") {
    // The most buckets that fit the budget (int8 embeddings dominate the size).
    const dim = opts.dim ?? 16;
    let lo = 64, hi = 1 << 16, best: Model | undefined, bestO: LinearOptions | undefined;
    while (hi - lo > Math.max(16, lo / 16)) {
      const buckets = Math.floor((lo + hi) / 2);
      const o: LinearOptions = { buckets, dim, epochs: opts.epochs ?? 30, lr: opts.lr ?? 1, seed: 20260928 };
      const m = trainLinear(ex, o);
      if (gzipBytes(m.data) <= budget) { best = m; bestO = o; lo = buckets; } else hi = buckets;
    }
    if (!best) throw new Error(`no linear model fits ${budget} bytes`);
    return { model: best, options: bestO!, words };
  }
  // Tree: the smallest support that fits the budget (binary search over minSupport).
  let lo = 0.5, hi = 64, best: Model | undefined, bestO: TreeOptions | undefined;
  for (let i = 0; i < 12; i++) {
    const mid = i === 0 ? lo : Math.sqrt(lo * hi);
    const o: TreeOptions = { minSupport: mid, minGain: opts.minGain ?? mid / 2, maxDepth: opts.maxDepth ?? 10 };
    const m = trainTree(ex, o);
    if (gzipBytes(m.data) <= budget) { best = m; bestO = o; hi = mid; if (i === 0) break; } else lo = mid;
  }
  if (!best) throw new Error(`no tree fits ${budget} bytes`);
  return { model: best, options: bestO!, words };
}

/** Pair metrics on one split of a label source, at confidence threshold tau. */
export function pairMetrics(model: Model, ex: Example[], tau = 0) {
  let fire = 0, fireRight = 0, fireWrong = 0, defer = 0, falseFire = 0, wFire = 0, wRight = 0, wDefer = 0, wFalse = 0;
  for (const e of ex) {
    const g = model.predict(e.word);
    const fired = g.label !== DEFER && g.conf >= tau;
    if (e.label === DEFER) {
      defer++; wDefer += e.weight;
      if (fired) { falseFire++; wFalse += e.weight; }
    } else {
      fire++; wFire += e.weight;
      if (fired && g.label === e.label) { fireRight++; wRight += e.weight; } else if (fired) fireWrong++;
    }
  }
  return { fire, coverage: fireRight / fire, wrongFire: fireWrong / fire, defer, falseFire: falseFire / defer, wCoverage: wRight / wFire, wFalseFire: wFalse / wDefer };
}

