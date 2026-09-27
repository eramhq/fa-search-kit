import { describe, expect, it } from "vitest";
import { bh, mcnemar, wilcoxon } from "../bench/lib/stats.ts";

describe("gate statistics", () => {
  it("McNemar: exact two-sided binomial on discordant pairs", () => {
    expect(mcnemar(0, 0)).toBe(1);
    expect(mcnemar(5, 5)).toBe(1);
    // 0 vs 6: 2 × 0.5^6
    expect(mcnemar(0, 6)).toBeCloseTo(2 / 64, 10);
    expect(mcnemar(10, 30)).toBeLessThan(0.01);
  });
  it("Wilcoxon: symmetric differences are not significant, one-sided ones are", () => {
    expect(wilcoxon([1, -1, 0.5, -0.5])).toBeGreaterThan(0.5);
    expect(wilcoxon(Array.from({ length: 30 }, (_, i) => 0.1 + i / 100))).toBeLessThan(0.001);
    expect(wilcoxon([0, 0, 0])).toBe(1);
  });
  it("Benjamini–Hochberg q-values are monotone and ≥ p", () => {
    const p = [0.01, 0.04, 0.03, 0.2];
    const q = bh(p);
    // Sorted p: .01 .03 .04 .2 → p·m/rank .04 .06 .0533 .2 → step-up minimum .04 .0533 .0533 .2.
    [0.04, 0.16 / 3, 0.16 / 3, 0.2].forEach((x, i) => expect(q[i]).toBeCloseTo(x, 10));
    q.forEach((x, i) => expect(x).toBeGreaterThanOrEqual(p[i]!));
  });
});
