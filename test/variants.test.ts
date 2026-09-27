import { describe, expect, it } from "vitest";
import { rng } from "../bench/lib/rng.ts";
import { VARIANTS, type Ctx } from "../bench/lib/variants.ts";
import { Verbs } from "../bench/lib/verbs.ts";
import { isArabicScript, rawTokens, standardTyping } from "../bench/lib/persian.ts";

const ZWNJ = "\u200C";
const gen = Object.fromEntries(VARIANTS);

function ctx(vocab: Record<string, number> = {}, extra: Partial<Ctx> = {}): Ctx {
  return {
    random: rng(1),
    vocab: new Map(Object.entries(vocab)),
    verbs: new Verbs(["رفت#رو", "کرد#کن", "شد#شو"].join("\n")),
    stop: new Set(["و", "در", "به", "از"]),
    ...extra,
  };
}
const run = (type: string, tokens: string[], c = ctx()) => gen[type]!(tokens, c);

describe("helpers", () => {
  it("rawTokens keeps ZWNJ inside words and splits on punctuation", () => {
    expect(rawTokens(`کتاب${ZWNJ}ها، (جدید)`)).toEqual([`کتاب${ZWNJ}ها`, "جدید"]);
  });
  it("isArabicScript is about letters, not digits", () => {
    expect(isArabicScript("۱۳۹۱")).toBe(false);
    expect(isArabicScript("کتاب")).toBe(true);
  });
  it("standardTyping folds Arabic letters and drops diacritics", () => {
    expect(standardTyping("كتاب\u064C عربي")).toBe("کتاب عربی");
  });
});

describe("letter variants", () => {
  it("arabic-yk swaps yeh and kaf", () => {
    expect(run("arabic-yk", ["کتاب", "ایرانی"])?.text).toBe("كتاب ايراني");
  });
  it("hamza only uses spellings common in real text", () => {
    expect(run("hamza", ["رئیس"], ctx({ "رییس": 9876 }))?.text).toBe("رییس");
    expect(run("hamza", ["رئیس"], ctx({ "رییس": 5 }))).toBeNull();
  });
  it("hamza never turns a plain yeh into hamza (مایو ≠ مائو)", () => {
    expect(run("hamza", ["مایو"], ctx({ "مائو": 1000 }))).toBeNull();
  });
  it("digits converts Latin digits to Persian", () => {
    expect(run("digits", ["حجم", "30"])?.text).toBe("حجم ۳۰");
  });
});

describe("half-space variants", () => {
  it("zwnj-space and zwnj-join", () => {
    expect(run("zwnj-space", [`می${ZWNJ}روم`])?.text).toBe("می روم");
    expect(run("zwnj-join", [`می${ZWNJ}روم`])?.text).toBe("میروم");
  });
  it("zwnj-add rejoins a spaced prefix with a half-space", () => {
    expect(run("zwnj-add", ["می", "رود"])?.text).toBe(`می${ZWNJ}رود`);
  });
});

describe("morphology variants", () => {
  it("plural-add uses an attested plural of the head noun", () => {
    const v = run("plural-add", ["گوشی", "سامسونگ"], ctx({ [`گوشی${ZWNJ}های`]: 1769 }));
    expect(v).toEqual({ text: `گوشی${ZWNJ}های سامسونگ`, subtype: "های/zwnj" });
  });
  it("plural-add refuses unattested plurals", () => {
    expect(run("plural-add", ["سامسونگ"])).toBeNull();
  });
  it("plural-drop only strips the ها family", () => {
    expect(run("plural-drop", [`کتاب${ZWNJ}ها`], ctx({ "کتاب": 100 }))?.text).toBe("کتاب");
    expect(run("plural-drop", ["فرمان"], ctx({ "فرم": 1000 }))).toBeNull();
  });
  it("verb variants only touch the verb the query builder marked", () => {
    const vocab = { [`می${ZWNJ}کند`]: 100, "کردن": 100, "نکرد": 100, "بکنیم": 100 };
    expect(run("verb-tense", ["سفر", "کرد"], ctx(vocab))).toBeNull();
    const v = run("verb-tense", ["سفر", "کرد"], ctx(vocab, { verbIndex: 1 }));
    expect(v?.text.startsWith("سفر ")).toBe(true);
    expect(v?.text).not.toBe("سفر کرد");
    expect(run("verb-negation", ["سفر", "کرد"], ctx(vocab, { verbIndex: 1 }))?.text).toBe("سفر نکرد");
  });
});

describe("typo variants", () => {
  it("never change the first letter and never touch digits", () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const type of ["typo-adjacent", "typo-delete", "typo-transpose", "homophone"]) {
        const v = run(type, ["سامسونگ", "۱۳۹۱"], ctx({}, { random: rng(seed) }));
        if (!v) continue;
        const [word, number] = v.text.split(" ");
        expect(number).toBe("۱۳۹۱");
        if (type !== "homophone") expect(word![0]).toBe("س");
      }
    }
  });
  it("homophone skips a silent word-final heh", () => {
    for (let seed = 0; seed < 30; seed++) {
      const v = run("homophone", ["خانه"], ctx({}, { random: rng(seed) }));
      expect(v).toBeNull();
    }
  });
});

describe("layout variants", () => {
  it("wrong layout (ISIRI 9147) gives the Latin keys", () => {
    expect(run("layout-isiri9147", ["دیجی"])?.text).toBe("nd[d");
  });
  it("latin-on-fa only converts Latin tokens", () => {
    expect(run("layout-latin-on-fa", ["گوشی", "Samsung"])?.text.startsWith("گوشی ")).toBe(true);
  });
});
