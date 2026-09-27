/** Paired tests for bench/compare.ts. */

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** Exact two-sided McNemar: binomial test of b vs c discordant pairs at p = 1/2. */
export function mcnemar(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Wilcoxon signed-rank, two-sided, normal approximation with tie and continuity correction. */
export function wilcoxon(diffs: number[]): number {
  const d = diffs.filter((x) => Math.abs(x) > 1e-12);
  const n = d.length;
  if (n === 0) return 1;
  const sorted = d.map((x) => ({ a: Math.abs(x), s: Math.sign(x) })).sort((x, y) => x.a - y.a);
  let wPlus = 0, tie = 0;
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && Math.abs(sorted[j + 1]!.a - sorted[i]!.a) < 1e-12) j++;
    const rank = (i + j + 2) / 2, t = j - i + 1;
    tie += t * t * t - t;
    for (let k = i; k <= j; k++) if (sorted[k]!.s > 0) wPlus += rank;
    i = j + 1;
  }
  const mean = (n * (n + 1)) / 4;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tie / 48;
  if (variance <= 0) return 1;
  const z = (Math.abs(wPlus - mean) - 0.5) / Math.sqrt(variance);
  return Math.min(1, 2 * (1 - phi(Math.max(0, z))));
}

/** Benjamini–Hochberg q-values. */
export function bh(p: number[]): number[] {
  const m = p.length;
  const order = p.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) {
    const [x, i] = order[r]!;
    min = Math.min(min, (x * m) / (r + 1));
    q[i] = min;
  }
  return q;
}
