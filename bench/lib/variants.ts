/**
 * Query variants: the ways real people type a query differently from how the
 * page wrote it. Each generator takes the canonical query tokens (copied from
 * the target's title) and returns one variant, or null when it does not apply,
 * so each variant type is counted only on queries it can really change.
 *
 * Morphological variants (plural, clitic, verb tense) must be attested in the
 * raw-source vocabulary, so no generator invents a non-word.
 */
import { LAYOUTS, latinToPersian, persianToLatin, type Layout } from "./keyboards.ts";
import { pick, shuffle } from "./rng.ts";
import {
  AR_KAF, AR_YEH, AR_DIGITS, DIACRITICS, FA_DIGITS, FA_KAF, FA_YEH, HOMOPHONES, ZWNJ,
  isArabicScript, isLatin, standardTyping,
} from "./persian.ts";
import type { Tense, Verbs } from "./verbs.ts";

export interface Ctx {
  random: () => number;
  vocab: Map<string, number>;
  verbs: Verbs;
  stop: Set<string>;
  /** Index of the title-final verb in the query tokens, when the query has one (news only). */
  verbIndex?: number;
  /** PerDT verb forms by gold lemma, for the Hazm-independent verb-tense-ud variant. */
  udVerbs?: UdVerbs;
}

export interface UdVerbs {
  /** Affirmative verb form → its PerDT lemma, for forms with exactly one lemma. */
  lemmaOf: Map<string, string>;
  /** Lemma → its affirmative forms. */
  forms: Map<string, string[]>;
}

export interface Variant {
  text: string;
  subtype?: string;
  /** The verb lemma a verb variant changed, for per-lemma averages. */
  lemma?: string;
}

export type Generator = (tokens: string[], ctx: Ctx) => Variant | null;

const attested = (ctx: Ctx, w: string) => ctx.vocab.has(w);
const join = (tokens: string[]) => tokens.join(" ");
const letters = (t: string) => t.replaceAll(ZWNJ, "").length;

/** Index of the first content word: in a Persian noun phrase that is the head noun. */
function headIndex(tokens: string[], ctx: Ctx): number {
  return tokens.findIndex((t) => isArabicScript(t) && letters(t) >= 2 && !ctx.stop.has(t) && !/\d|[۰-۹]/.test(t));
}

function replaceAt(tokens: string[], i: number, ...replacement: string[]): string[] {
  return [...tokens.slice(0, i), ...replacement, ...tokens.slice(i + 1)];
}

/** A random content token (Arabic script, 3+ letters, not a stop word), or -1. */
function contentIndex(tokens: string[], ctx: Ctx, minLetters = 3): number {
  const idx = tokens.map((t, i) => i).filter((i) => isArabicScript(tokens[i]!) && letters(tokens[i]!) >= minLetters && !ctx.stop.has(tokens[i]!));
  return idx.length ? pick(ctx.random, idx) : -1;
}

// --- Letters -------------------------------------------------------------

/** The doc spells something non-standardly (Arabic ي/ك, diacritics); the searcher types standard Persian. */
const stdTyping: Generator = (tokens) => ({ text: standardTyping(join(tokens)) });

/** Arabic keyboard (or iPhone Arabic layout): ی→ي, ک→ك. */
const arabicYehKaf: Generator = (tokens) => ({ text: join(tokens).replaceAll(FA_YEH, AR_YEH).replaceAll(FA_KAF, AR_KAF) });

/** Lazy typing of alef-madda: آ → ا. */
const alefMadda: Generator = (tokens) => ({ text: join(tokens).replaceAll("آ", "ا") });

/** Hamza spellings the Academy allows or people use: رئیس/رییس, تأثیر/تاثیر, مؤسسه/موسسه. */
// Only from a hamza letter to a plain one or another hamza seat: the reverse (ی → ئ)
// turns real words into other real words (مایو → مائو).
const HAMZA_SWAPS: [string, string][] = [["ئ", "ی"], ["ئ", "ا"], ["ئ", "أ"], ["أ", "ا"], ["أ", "ئ"], ["ؤ", "و"], ["إ", "ا"]];
/** An alternative spelling counts only if it is common in published text. */
const HAMZA_MIN_COUNT = 20;
const hamza: Generator = (tokens, ctx) => {
  const options: { i: number; to: string; subtype: string }[] = [];
  tokens.forEach((t, i) => {
    for (const [from, to] of HAMZA_SWAPS) {
      const swapped = t.replaceAll(from, to);
      if (swapped !== t && (ctx.vocab.get(swapped) ?? 0) >= HAMZA_MIN_COUNT) options.push({ i, to: swapped, subtype: `${from}>${to}` });
    }
  });
  if (!options.length) return null;
  const o = pick(ctx.random, options);
  return { text: join(replaceAt(tokens, o.i, o.to)), subtype: o.subtype };
};

/** Heh + ezafe/yeh: ۀ, هٔ, ه\u200Cی, and plain ه are used interchangeably. */
const hehYeh: Generator = (tokens, ctx) => {
  const forms = ["ه", "ه\u0654", "ه\u200Cی", "ۀ"];
  const marked = tokens.findIndex((t) => /ۀ|ه\u0654/.test(t));
  if (marked >= 0) {
    const t = tokens[marked]!;
    const from = t.includes("ۀ") ? "ۀ" : "ه\u0654";
    const to = pick(ctx.random, forms.filter((f) => f !== from));
    return { text: join(replaceAt(tokens, marked, t.replace(from, to))), subtype: `${from}>${to}` };
  }
  // Unmarked ezafe: a non-final word ending in ه, as in «نظریه تاریخ».
  const bare = tokens.map((t, i) => i).filter((i) => i < tokens.length - 1 && /[^ا]ه$/.test(tokens[i]!) && isArabicScript(tokens[i]!) && !ctx.stop.has(tokens[i]!));
  if (!bare.length) return null;
  const i = pick(ctx.random, bare);
  const to = pick(ctx.random, forms.slice(1));
  return { text: join(replaceAt(tokens, i, tokens[i]!.slice(0, -1) + to)), subtype: `ه>${to}` };
};

const diacritics: Generator = (tokens) => ({ text: join(tokens).replace(DIACRITICS, "") });

const digits: Generator = (tokens) => {
  const text = join(tokens);
  if (/[0-9]/.test(text)) return { text: text.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]!), subtype: "latin>persian" };
  if (/[۰-۹]/.test(text)) return { text: text.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))), subtype: "persian>latin" };
  if (/[٠-٩]/.test(text)) return { text: text.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))), subtype: "arabic>latin" };
  return null;
};

// --- Half-space ------------------------------------------------------------

const zwnjSpace: Generator = (tokens) => ({ text: join(tokens).replaceAll(ZWNJ, " ") });
const zwnjJoin: Generator = (tokens) => ({ text: join(tokens).replaceAll(ZWNJ, "") });

const SPACED_SUFFIXES = new Set(["ها", "های", "هایی", "تر", "ترین", "ای", "ام", "اند", "ایم", "اید", "هایش", "هایشان"]);
/** The reverse: the doc used a space or joined spelling, the searcher types the half-space. */
const zwnjAdd: Generator = (tokens, ctx) => {
  const options: string[][] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!, next = tokens[i + 1];
    if (next && (t === "می" || t === "نمی")) options.push([...tokens.slice(0, i), t + ZWNJ + next, ...tokens.slice(i + 2)]);
    if (next && SPACED_SUFFIXES.has(next) && isArabicScript(t)) options.push([...tokens.slice(0, i), t + ZWNJ + next, ...tokens.slice(i + 2)]);
    if (t.includes(ZWNJ)) continue;
    const m = /^(ن?می)(.{2,})$/.exec(t);
    if (m && ctx.verbs.analyze(`${m[1]}${ZWNJ}${m[2]}`).length) options.push(replaceAt(tokens, i, `${m[1]}${ZWNJ}${m[2]}`));
    const s = /^(.{2,})(ها|های|هایی)$/.exec(t);
    if (s && attested(ctx, s[1]!) && attested(ctx, `${s[1]}${ZWNJ}${s[2]}`)) options.push(replaceAt(tokens, i, `${s[1]}${ZWNJ}${s[2]}`));
  }
  return options.length ? { text: join(pick(ctx.random, options)) } : null;
};

// --- Morphology --------------------------------------------------------------

/** Searcher types the plural: «گوشی سامسونگ» → «گوشی\u200Cهای سامسونگ» / «گوشیهای سامسونگ». */
const pluralAdd: Generator = (tokens, ctx) => {
  const i = headIndex(tokens, ctx);
  if (i < 0) return null;
  const head = tokens[i]!;
  if (/ها(ی|یی)?$/.test(head) || head.includes(ZWNJ)) return null;
  const suffix = i < tokens.length - 1 ? "های" : "ها";
  const styles = ([["zwnj", head + ZWNJ + suffix], ["joined", head + suffix]] as const).filter(([, form]) => attested(ctx, form));
  if (!styles.length) return null;
  const [style, form] = pick(ctx.random, styles);
  return { text: join(replaceAt(tokens, i, form)), subtype: `${suffix}/${style}` };
};

/**
 * The doc has the plural, the searcher types the singular. Only the ها family:
 * ان/ات endings are too ambiguous to strip blind (فرمان → فرم, قائنات → قائن).
 */
const pluralDrop: Generator = (tokens, ctx) => {
  const options: { i: number; stem: string; subtype: string }[] = [];
  tokens.forEach((t, i) => {
    const m = /^(.{2,}?)(\u200C?)(ها|های|هایی)$/.exec(t);
    if (!m) return;
    const [, stem, zw, suffix] = m as unknown as [string, string, string, string];
    if (attested(ctx, stem) && letters(stem) >= 2) options.push({ i, stem, subtype: `${suffix}${zw ? "/zwnj" : ""}` });
  });
  if (!options.length) return null;
  const o = pick(ctx.random, options);
  return { text: join(replaceAt(tokens, o.i, o.stem)), subtype: o.subtype };
};

/** Possessive clitics: کتابم, کتابش, کتابمان. Snowball deliberately leaves مان/تان/شان alone. */
const CLITICS = ["م", "ت", "ش", "مان", "تان", "شان"];
const cliticAdd: Generator = (tokens, ctx) => {
  const i = headIndex(tokens, ctx);
  if (i < 0) return null;
  const head = tokens[i]!;
  for (const c of shuffle(ctx.random, CLITICS)) {
    for (const form of [head + c, head + ZWNJ + (/[هی]$/.test(head) ? "ا" : "") + c]) {
      if (attested(ctx, form) && (ctx.vocab.get(form) ?? 0) >= 5) return { text: join(replaceAt(tokens, i, form)), subtype: c };
    }
  }
  return null;
};

/** The title-final verb chosen by the query builder (Persian is verb-final). */
function finalVerb(tokens: string[], ctx: Ctx) {
  if (ctx.verbIndex === undefined) return null;
  const form = ctx.verbs.analyze(tokens[ctx.verbIndex]!).find((f) => f.tense !== "inf");
  return form ? { i: ctx.verbIndex, form } : null;
}

/** «... را تصویب کرد» searched as «... تصویب می\u200Cکند» / «تصویب کردن» / «تصویب کنیم». */
const TARGETS: { name: string; tense: Tense; person: number }[] = [
  { name: "present", tense: "presProg", person: 2 },
  { name: "past", tense: "past", person: 2 },
  { name: "infinitive", tense: "inf", person: -1 },
  { name: "subjunctive", tense: "subj", person: 3 },
];
const verbTense: Generator = (tokens, ctx) => {
  const v = finalVerb(tokens, ctx);
  if (!v) return null;
  for (const target of shuffle(ctx.random, TARGETS)) {
    if (target.tense === v.form.tense || (v.form.tense === "participle" && target.tense === "past")) continue;
    const out = ctx.verbs.generate(v.form.past, v.form.present, target.tense, target.person, false);
    if (out && attested(ctx, out)) {
      return { text: join(replaceAt(tokens, v.i, out)), subtype: `${v.form.tense}>${target.name}`, lemma: `${v.form.past}#${v.form.present}` };
    }
  }
  return null;
};

/**
 * The same verb in another attested form, taken from the PerDT treebank's gold
 * lemmas instead of from Hazm's stem list and our conjugator. It is the check
 * that verb results are not an artefact of the generator and the lexicon both
 * using Hazm: it brings perfect, passive, future and other forms `conjugate()`
 * never makes («گفته», «خواهد», «شده»). Affirmative forms only (negation has its
 * own row); ZWNJ-only differences are left to the zwnj rows.
 */
const verbTenseUd: Generator = (tokens, ctx) => {
  if (ctx.verbIndex === undefined || !ctx.udVerbs) return null;
  const token = tokens[ctx.verbIndex]!;
  const lemma = ctx.udVerbs.lemmaOf.get(token);
  if (!lemma) return null;
  const bare = (w: string) => w.replaceAll(ZWNJ, "");
  const options = (ctx.udVerbs.forms.get(lemma) ?? []).filter((f) => bare(f) !== bare(token) && attested(ctx, f));
  if (!options.length) return null;
  return { text: join(replaceAt(tokens, ctx.verbIndex, pick(ctx.random, options))), lemma };
};

/** The searcher types the negative form. Snowball keeps نمی/ن to avoid merging opposites. */
const verbNegation: Generator = (tokens, ctx) => {
  const v = finalVerb(tokens, ctx);
  if (!v || v.form.negative) return null;
  const out = ctx.verbs.generate(v.form.past, v.form.present, v.form.tense, v.form.person, true);
  return out && attested(ctx, out) ? { text: join(replaceAt(tokens, v.i, out)), subtype: v.form.tense, lemma: `${v.form.past}#${v.form.present}` } : null;
};

// --- Typos -------------------------------------------------------------------

const homophone: Generator = (tokens, ctx) => {
  const options: { i: number; pos: number; group: string[] }[] = [];
  tokens.forEach((t, i) => {
    if (!isArabicScript(t) || letters(t) < 3 || ctx.stop.has(t)) return;
    const chars = [...t];
    chars.forEach((ch, pos) => {
      if (ch === "ه" && (pos === chars.length - 1 || chars[pos + 1] === ZWNJ)) return; // silent final heh
      const group = HOMOPHONES.find((g) => g.includes(ch));
      if (group) options.push({ i, pos, group });
    });
  });
  if (!options.length) return null;
  const o = pick(ctx.random, options);
  const chars = [...tokens[o.i]!];
  const from = chars[o.pos]!;
  const to = pick(ctx.random, o.group.filter((c) => c !== from));
  chars[o.pos] = to;
  return { text: join(replaceAt(tokens, o.i, chars.join(""))), subtype: `${from}>${to}` };
};

const QWERTY_ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];
const ISIRI = LAYOUTS.find((l) => l.id === "isiri9147")!;
const keyOf = new Map(Object.entries(ISIRI.base).map(([key, ch]) => [ch, key]));
function neighbours(ch: string): string[] {
  const key = keyOf.get(ch);
  if (!key) return [];
  for (const row of QWERTY_ROWS) {
    const k = row.indexOf(key);
    if (k < 0) continue;
    return [row[k - 1], row[k + 1]].filter((x): x is string => !!x).map((x) => ISIRI.base[x]!).filter((c) => c && isArabicScript(c));
  }
  return [];
}

/** Hitting the key next to the right one on a standard Persian keyboard. Never the first letter. */
const typoAdjacent: Generator = (tokens, ctx) => {
  const i = contentIndex(tokens, ctx, 4);
  if (i < 0) return null;
  const chars = [...tokens[i]!];
  const positions = chars.map((_, p) => p).filter((p) => p > 0 && neighbours(chars[p]!).length);
  if (!positions.length) return null;
  const p = pick(ctx.random, positions);
  chars[p] = pick(ctx.random, neighbours(chars[p]!));
  return { text: join(replaceAt(tokens, i, chars.join(""))) };
};

const typoDelete: Generator = (tokens, ctx) => {
  const i = contentIndex(tokens, ctx, 4);
  if (i < 0) return null;
  const chars = [...tokens[i]!];
  const positions = chars.map((_, p) => p).filter((p) => p > 0 && chars[p] !== ZWNJ);
  const p = pick(ctx.random, positions);
  chars.splice(p, 1);
  return { text: join(replaceAt(tokens, i, chars.join(""))) };
};

const typoTranspose: Generator = (tokens, ctx) => {
  const i = contentIndex(tokens, ctx, 4);
  if (i < 0) return null;
  const chars = [...tokens[i]!];
  const positions = chars.map((_, p) => p).filter((p) => p > 0 && p < chars.length - 1 && chars[p] !== chars[p + 1] && chars[p] !== ZWNJ && chars[p + 1] !== ZWNJ);
  if (!positions.length) return null;
  const p = pick(ctx.random, positions);
  [chars[p], chars[p + 1]] = [chars[p + 1]!, chars[p]!];
  return { text: join(replaceAt(tokens, i, chars.join(""))) };
};

// --- Keyboard layout -----------------------------------------------------------

/** Meant to type Persian, but the OS was on US English. */
const wrongLayout = (layout: Layout): Generator => (tokens) =>
  tokens.some(isArabicScript) ? { text: persianToLatin(standardTyping(join(tokens)), layout) } : null;

/** Meant to type a Latin brand or model name, but the OS was still on Persian. */
const latinOnPersian: Generator = (tokens) => {
  if (!tokens.some((t) => isLatin(t))) return null;
  return { text: join(tokens.map((t) => (isLatin(t) ? latinToPersian(t.toLowerCase(), ISIRI) : t))) };
};

// --- Mixed ---------------------------------------------------------------------

/** Two everyday differences at once, as in real queries (e.g. Arabic yeh + no half-space). */
const COMBINABLE: [string, Generator][] = [
  ["arabic-yk", arabicYehKaf], ["zwnj-join", zwnjJoin], ["zwnj-space", zwnjSpace], ["alef-madda", alefMadda],
  ["hamza", hamza], ["plural-add", pluralAdd], ["digits", digits], ["heh-yeh", hehYeh],
];
const combo: Generator = (tokens, ctx) => {
  let current = tokens;
  const applied: string[] = [];
  for (const [name, gen] of shuffle(ctx.random, COMBINABLE)) {
    const v = gen(current, ctx);
    if (!v || v.text === join(current)) continue;
    current = v.text.split(" ");
    applied.push(name);
    if (applied.length === 2) return { text: v.text, subtype: applied.sort().join("+") };
  }
  return null;
};

/** Variant types in report order. `canonical` is the control row. */
export const VARIANTS: [string, Generator][] = [
  ["canonical", (tokens) => ({ text: join(tokens) })],
  ["std-typing", stdTyping],
  ["arabic-yk", arabicYehKaf],
  ["alef-madda", alefMadda],
  ["hamza", hamza],
  ["heh-yeh", hehYeh],
  ["diacritics", diacritics],
  ["digits", digits],
  ["zwnj-space", zwnjSpace],
  ["zwnj-join", zwnjJoin],
  ["zwnj-add", zwnjAdd],
  ["plural-add", pluralAdd],
  ["plural-drop", pluralDrop],
  ["clitic-add", cliticAdd],
  ["verb-tense", verbTense],
  ["verb-tense-ud", verbTenseUd],
  ["verb-negation", verbNegation],
  ["homophone", homophone],
  ["typo-adjacent", typoAdjacent],
  ["typo-delete", typoDelete],
  ["typo-transpose", typoTranspose],
  ...LAYOUTS.map((l): [string, Generator] => [`layout-${l.id}`, wrongLayout(l)]),
  ["layout-latin-on-fa", latinOnPersian],
  ["combo", combo],
];
