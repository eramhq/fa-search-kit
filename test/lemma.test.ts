import { describe, expect, it } from "vitest";
import { createAnalyzer } from "../src/index.ts";
import { createLexicon, lexicon } from "../src/lexicon/index.ts";
import { KEEP, PLURALS, VERBS } from "../src/lexicon/data.ts";
import { applyEdit, encodeEdit, editKey, parseEdit } from "../scripts/lemma/edit.ts";
import { createLemmaLexicon, type Predictor } from "../scripts/lemma/wrap.ts";
import { decodeTree, trainTree } from "../scripts/lemma/tree.ts";
import { decodeList, trainList } from "../scripts/lemma/list.ts";
import { decodeLinear, trainLinear } from "../scripts/lemma/linear.ts";
import { predictorOf } from "../scripts/lemma/model.ts";
import type { Example } from "../scripts/lemma/examples.ts";

const q = (a: ReturnType<typeof createAnalyzer>, t: string) => a.analyze(t, { mode: "query" }).join(" ");
const full = createAnalyzer({ profile: "full", lexicon });

describe("edit scripts", () => {
  it.each([
    ["حملات", "حمله", false, false],
    ["نویسندگان", "نویس", false, false],
    ["ابتدای", "ابتدا", false, false],
    ["میپرسیدند", "پرسید", true, false],
    ["بپرسد", "پرسید", true, false],
    ["نمیپرسم", "نپرسید", true, true],
    ["نپرسیدند", "نپرسید", true, true],
  ])("%s → %s round-trips", (w, t, verb, neg) => {
    const e = encodeEdit(w, t, verb, neg)!;
    expect(e).toBeDefined();
    expect(applyEdit(w, e, true)).toBe(t);
    expect(parseEdit(editKey(e))).toEqual(e);
  });
  it("merged negation drops the ن", () => {
    const e = encodeEdit("نمیپرسم", "نپرسید", true, true)!;
    expect(applyEdit("نمیپرسم", e, false)).toBe("پرسید");
  });
  it("an edit that does not fit gives nothing", () => {
    expect(applyEdit("کتاب", { verb: true, p: "می", k: 0, a: "" }, true)).toBeUndefined();
    expect(applyEdit("کت", { verb: false, p: "", k: 2, a: "" }, true)).toBeUndefined();
  });
});

describe("the lemma lexicon wrapper", () => {
  const texts = ["نویسندگان حملات را در ابتدای کار", "نمی‌پرسیدند که کتاب‌هایمان کجاست", "ماهی ماه مهمان مهم کشتی کشت بیست بود علمی علم", "The iPhone 15 Pro"];
  it("a model that always defers gives exactly fa-full's terms", () => {
    const never: Predictor = () => undefined;
    const a = createAnalyzer({ profile: "full", lexicon: createLemmaLexicon(lexicon, never) });
    for (const t of texts) {
      expect(a.analyze(t, { mode: "index" })).toEqual(full.analyze(t, { mode: "index" }));
      expect(a.analyze(t, { mode: "query" })).toEqual(full.analyze(t, { mode: "query" }));
    }
  });
  // A toy model: «حملات» → حمله, «نویسندگان» → نویس, «ابتدای» → ابتدا, «پرسانیدند» and «می‌پرسانم» → پرسانید.
  const table = new Map([
    ["حملات", encodeEdit("حملات", "حمله", false)!], ["نویسندگان", encodeEdit("نویسندگان", "نویس", false)!],
    ["ابتدای", encodeEdit("ابتدای", "ابتدا", false)!], ["ماهی", encodeEdit("ماهی", "ماه", false)!],
    ["پرسانیدند", encodeEdit("پرسانیدند", "پرسانید", true)!], ["میپرسانم", encodeEdit("میپرسانم", "پرسانید", true)!],
    ["نمیپرسانم", encodeEdit("نمیپرسانم", "نپرسانید", true, true)!],
  ]);
  const toy: Predictor = (w) => (table.has(w) ? { edit: table.get(w)!, conf: 0.9 } : undefined);
  const lemma = createAnalyzer({ profile: "full", lexicon: createLemmaLexicon(lexicon, toy) });
  it("links forms the rules miss", () => {
    expect(q(lemma, "حملات")).toBe(q(lemma, "حمله"));
    expect(q(lemma, "نویسندگان")).toBe(q(lemma, "نویسنده"));
    expect(q(lemma, "ابتدای")).toBe(q(lemma, "ابتدا"));
    expect(q(lemma, "پرسانیدند")).toBe(q(lemma, "می‌پرسانم"));
  });
  it("the base lexicon wins: its words and verbs, and PROTECTED words, are never re-read", () => {
    const always: Predictor = (w) => ({ edit: encodeEdit(w, w.slice(0, -1), false)!, conf: 1 });
    const greedy = createAnalyzer({ profile: "full", lexicon: createLemmaLexicon(lexicon, always) });
    for (const w of ["می‌رود", "مهمان", "فیلم", "کتب", "هفته"]) expect(q(greedy, w), w).toBe(q(full, w));
  });
  it("the verb channel follows the negation setting", () => {
    expect(q(lemma, "نمی‌پرسانم")).toBe("نپرسانید");
    const merged = createAnalyzer({ profile: "full", lexicon: createLemmaLexicon(lexicon, toy), negation: "merge" });
    expect(q(merged, "نمی‌پرسانم")).toBe("پرسانید");
  });
  it("the verb channel runs only with verb lemmas", () => {
    const stem = createAnalyzer({ profile: "full", lexicon: createLemmaLexicon(lexicon, toy), verbs: "stem" });
    expect(q(stem, "پرسانیدند")).toBe(q(createAnalyzer({ profile: "full", lexicon, verbs: "stem" }), "پرسانیدند"));
  });
  it("a threshold above the confidence defers", () => {
    const strict = createAnalyzer({ profile: "full", lexicon: createLemmaLexicon(lexicon, toy, 0.95) });
    expect(q(strict, "حملات")).toBe(q(full, "حملات"));
  });
  it("query terms ⊆ index terms", () => {
    for (const t of texts) {
      const index = new Set(lemma.analyze(t, { mode: "index" }));
      for (const term of lemma.analyze(t, { mode: "query" })) expect(index, `${t}: ${term}`).toContain(term);
    }
  });
});

describe("models: the decoder matches the trained model", () => {
  const words = ["حملات", "مسابقات", "جلسات", "کلمات", "نویسندگان", "خوانندگان", "رانندگان", "ابتدای", "دریای", "معنای", "کتاب", "درخت", "خانه", "ماهی", "میپرسیدند", "میخوابیدند", "میدویدند", "پرسیدم"];
  const label = (w: string) => {
    const t: Record<string, [string, boolean]> = { حملات: ["حمله", false], مسابقات: ["مسابقه", false], جلسات: ["جلسه", false], کلمات: ["کلمه", false],
      نویسندگان: ["نویس", false], خوانندگان: ["خواننده", false], رانندگان: ["راننده", false], ابتدای: ["ابتدا", false], دریای: ["دریا", false], معنای: ["معنا", false],
      میپرسیدند: ["پرسید", true], میخوابیدند: ["خوابید", true], میدویدند: ["دوید", true], پرسیدم: ["پرسید", true] };
    const x = t[w];
    return x ? editKey(encodeEdit(w, x[0], x[1])!) : "";
  };
  const ex: Example[] = words.map((w, i) => ({ word: w, label: label(w), weight: 1 + (i % 3), count: 10, split: "train", cls: "test" }));
  it.each([
    ["tree", () => trainTree(ex, { minSupport: 0.5, minGain: 0.1, maxDepth: 8 }), decodeTree],
    ["list", () => trainList(ex, 10_000), decodeList],
    ["linear", () => trainLinear(ex, { buckets: 64, dim: 8, epochs: 20, lr: 0.5, seed: 1 }), decodeLinear],
  ] as const)("%s", (_, trained, decode) => {
    const m = trained();
    const d = decode(m.data);
    for (const w of [...words, "گلدان", "مقالات", "میرفتیم"]) expect(d.predict(w), w).toEqual(m.predict(w));
    // Trained again: the same bytes.
    expect(trained().data).toBe(m.data);
    // Through the wrapper it is a predictor.
    expect(typeof predictorOf(d)).toBe("function");
  });
  it("tree: learns the regular pattern for an unseen word", () => {
    const m = trainTree(ex, { minSupport: 0.5, minGain: 0.1, maxDepth: 8 });
    expect(m.predict("مقالات").label).toBe(label("جلسات"));
  });
});

describe("the shipped lexicon's lemma list (Phase 4b)", () => {
  const plain = createAnalyzer({ profile: "full", lexicon: createLexicon(VERBS, KEEP, PLURALS) });
  it.each([
    ["نویسندگان", "نویسنده"], ["ستارگان", "ستاره"], ["بازیگران", "بازیگر"], ["مدیران", "مدیر"], ["سخت‌تر", "سخت"],
  ])("%s and %s share a term (they did not before)", (form, lemma) => {
    expect(q(full, form)).toBe(q(full, lemma));
    expect(q(plain, form)).not.toBe(q(plain, lemma));
  });
  it.each([
    ["ماهی", "ماه"], ["مهمان", "مهم"], ["کشتی", "کشت"], ["بیست", "بود"], ["علمی", "علم"], ["کرمان", "کرم"],
    // Half-space readings the bare lookup could confuse, and a stop word.
    ["نامه‌ای", "نام‌های"], ["دست‌های", "دسته‌ای"], ["آنها", "آن"],
  ])("%s and %s stay apart", (a, b) => {
    expect(q(full, a)).not.toBe(q(full, b));
  });
  it("without the list the lexicon is the one before Phase 4b", () => {
    const empty = createAnalyzer({ profile: "full", lexicon: createLexicon(VERBS, KEEP, PLURALS, "") });
    for (const t of ["نویسندگان حملات را در ابتدای کار", "بازیگران سخت‌تر"]) expect(empty.analyze(t)).toEqual(plain.analyze(t));
  });
  it("query terms ⊆ index terms", () => {
    for (const t of ["نویسندگان و بازیگران", "ستارگان سخت‌ترین شب", "مدیران نمی‌خواهند"]) {
      const index = new Set(full.analyze(t, { mode: "index" }));
      for (const term of full.analyze(t, { mode: "query" })) expect(index, `${t}: ${term}`).toContain(term);
    }
  });
});
