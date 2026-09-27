import { describe, expect, it } from "vitest";
import { conjugate, Verbs } from "../bench/lib/verbs.ts";

const ZWNJ = "\u200C";
const verbs = new Verbs(["رفت#رو", "آمد#آ", "افتاد#افت", "افزود#افزا", "کرد#کن", "گفت#گو", "گفت#گوی"].join("\n"));
const forms = (past: string, present: string) => new Set(conjugate(past, present).map((f) => f.form));

describe("conjugate", () => {
  it.each([
    ["رفت", "رو", ["رفتم", "رفت", "رفتند", `می${ZWNJ}روم`, `می${ZWNJ}رود`, "بروم", "رفتن", "رفته", "نرفت", `نمی${ZWNJ}رود`, "نروم"]],
    ["کرد", "کن", ["کرد", `می${ZWNJ}کند`, "بکنیم", "کردن", "نکرد", `نمی${ZWNJ}کنند`]],
  ])("%s#%s makes the regular forms", (past, present, expected) => {
    const all = forms(past, present);
    for (const f of expected) expect(all, f).toContain(f);
  });

  it("handles initial alef: آمد → نیامد, بیاید; افتاد → بیفتد", () => {
    expect(forms("آمد", "آ")).toContain("نیامد");
    expect(forms("آمد", "آ")).toContain("بیاید");
    expect(forms("آمد", "آ")).toContain(`می${ZWNJ}آید`);
    expect(forms("افتاد", "افت")).toContain("بیفتد");
  });

  it("inserts the glide yeh after a stem-final alef: افزا → می\u200Cافزاید", () => {
    expect(forms("افزود", "افزا")).toContain(`می${ZWNJ}افزاید`);
  });
});

describe("Verbs", () => {
  it("analyzes a form back to its stems and tense", () => {
    const [f] = verbs.analyze(`می${ZWNJ}رود`);
    expect(f).toMatchObject({ past: "رفت", present: "رو", tense: "presProg", person: 2, negative: false });
  });

  it("does not know nouns", () => {
    expect(verbs.analyze("کتاب")).toEqual([]);
  });

  it("generates a requested form", () => {
    expect(verbs.generate("رفت", "رو", "past", 5, true)).toBe("نرفتند");
    expect(verbs.generate("کرد", "کن", "inf", -1, false)).toBe("کردن");
  });
});
