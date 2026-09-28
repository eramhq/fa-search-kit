/**
 * Edit scripts: what a lemma model predicts for a bare word (ZWNJ removed).
 *
 * An edit strips a verb prefix, cuts final letters and appends a string; its kind
 * says which lexicon channel uses it. The result is the final term, never a lemma
 * that goes through the rules again:
 * - verb: (ن)+past stem, the term space of `lexicon.verb`. The prefixes نمی and ن
 *   keep a ن in front when negation is kept («نمی‌پرسم» → «نپرسید»), and drop it
 *   when it is merged («پرسید»).
 * - nominal: the term fa-full gives the word's lemma («حملات» → «حمله»).
 */

/** The label for "leave the word to the rules". */
export const DEFER = "";

export type Prefix = "" | "ب" | "می" | "نمی" | "ن";
export const PREFIXES: readonly Prefix[] = ["", "ب", "می", "نمی", "ن"];

export interface Edit {
  verb: boolean;
  p: Prefix;
  /** Final letters to cut (0–8). */
  k: number;
  /** Appended after the cut. */
  a: string;
}

export const MAX_CUT = 8;
export const editKey = (e: Edit) => `${e.verb ? "v" : "n"}|${e.p}|${e.k}|${e.a}`;
export function parseEdit(key: string): Edit {
  const [v, p, k, a] = key.split("|") as [string, Prefix, string, string];
  return { verb: v === "v", p, k: Number(k), a };
}

/** The term an edit gives `w`, or undefined when it does not fit (no such prefix, too short). */
export function applyEdit(w: string, e: Edit, keepNegation: boolean): string | undefined {
  if (!w.startsWith(e.p)) return undefined;
  const rest = w.slice(e.p.length);
  if (rest.length - e.k < 1) return undefined;
  const out = rest.slice(0, rest.length - e.k) + e.a;
  const neg = keepNegation && (e.p === "نمی" || e.p === "ن") ? "ن" : "";
  return out.length >= 2 ? neg + out : undefined;
}

const lcp = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/**
 * The cheapest edit from `w` to the term `t` (under kept negation). `negated`: a
 * verb form with negation, whose target starts with ن. Undefined when no edit
 * within MAX_CUT reaches it.
 */
export function encodeEdit(w: string, t: string, verb: boolean, negated = false): Edit | undefined {
  if (!verb) {
    const n = lcp(w, t);
    const k = w.length - n;
    return k <= MAX_CUT ? { verb, p: "", k, a: t.slice(n) } : undefined;
  }
  if (negated && !t.startsWith("ن")) return undefined;
  const core = negated ? t.slice(1) : t;
  let best: Edit | undefined, cost = Infinity;
  for (const p of (negated ? ["نمی", "ن"] : ["", "می", "ب"]) as Prefix[]) {
    if (!w.startsWith(p)) continue;
    const rest = w.slice(p.length);
    const n = lcp(rest, core);
    const k = rest.length - n, a = core.slice(n);
    if (k > MAX_CUT || rest.length - k < 1) continue;
    if (k + a.length < cost) { cost = k + a.length; best = { verb, p, k, a }; }
  }
  return best;
}
