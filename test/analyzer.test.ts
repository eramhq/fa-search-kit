import { describe, expect, it } from "vitest";
import { createAnalyzer, normalize, Stemmer, tokenize } from "../src/index.ts";
import { createLexicon, lexicon } from "../src/lexicon/index.ts";

const Z = "‌";
const light = createAnalyzer({ profile: "light" });
const standard = createAnalyzer({ profile: "standard" });
const full = createAnalyzer({ profile: "full", lexicon });
const q = (a: typeof standard, text: string) => a.analyze(text, { mode: "query" });

describe("normalize", () => {
  it.each([
    ["كتاب", "کتاب"], ["علي", "علی"], ["مصطفى", "مصطفی"], ["مدرسة", "مدرسه"], ["نامۀ", "نامه"], ["نامهٔ", "نامه"],
    ["أحمد", "احمد"], ["إسلام", "اسلام"], ["مؤسسه", "موسسه"], ["۳۰", "30"], ["٣٠", "30"], ["قبلاً", "قبلا"],
    ["محمّد", "محمد"], ["کـتـاب", "کتاب"], ["سلامممم", "سلام"], ["iPhone", "iphone"], ["1000", "1000"], ["III", "iii"],
  ])("%s → %s", (input, output) => {
    expect(normalize(input).text).toBe(output);
  });

  it("keeps ZWNJ between letters, collapses runs, drops it at word edges and next to spaces", () => {
    expect(normalize(`می${Z}روم`).text).toBe(`می${Z}روم`);
    expect(normalize(`می${Z}${Z}روم`).text).toBe(`می${Z}روم`);
    expect(normalize(`${Z}کتاب${Z} ها`).text).toBe("کتاب ها");
  });

  it("turns ZWSP and ¬ between letters into ZWNJ", () => {
    expect(normalize("می​روم").text).toBe(`می${Z}روم`);
    expect(normalize("می¬روم").text).toBe(`می${Z}روم`);
  });

  it("removes bidi marks, ZWJ and BOM", () => {
    expect(normalize("﻿‏کتاب‍‎").text).toBe("کتاب");
  });

  it("folds ئ only when asked, and never آ (the analyzer indexes the madda-less spelling instead)", () => {
    expect(normalize("آب رئیس").text).toBe("آب رئیس");
    expect(normalize("آب رئیس", { hamzaYeh: true }).text).toBe("آب رییس");
  });

  it("expands presentation forms (NFKC) with a one-to-many offset map", () => {
    const text = "درود ﷺ و ﻻ";
    const n = normalize(text);
    expect(n.text).toBe("درود صلی الله علیه وسلم و لا");
    // Every character of the ﷺ expansion points at the one original character.
    const k = n.text.indexOf("صلی");
    expect([n.map[2 * k], n.map[2 * k + 1]]).toEqual([5, 6]);
    const last = n.text.indexOf("وسلم") + 3;
    expect([n.map[2 * last], n.map[2 * last + 1]]).toEqual([5, 6]);
  });

  it("is idempotent", () => {
    for (const s of ["كتاب‌هاي من", "نامۀ ۳۰ ﷺ", "سلامممم  می¬روم", "‏قبلاً‌ ‌"]) {
      const once = normalize(s).text;
      expect(normalize(once).text).toBe(once);
    }
  });
});

describe("tokens and offsets", () => {
  it("maps every token back to the original text", () => {
    const text = "كتاب‌هاي   جديد، مي روم به ﷺ خانه ای";
    const toks = standard.tokens(text);
    expect(toks.map((t) => t.text)).toEqual([`کتاب${Z}های`, "جدید", `می${Z}روم`, "به", "صلی", "الله", "علیه", "وسلم", `خانه${Z}ای`]);
    expect(toks.map((t) => text.slice(t.start, t.end))).toEqual(
      ["كتاب‌هاي", "جديد", "مي روم", "به", "ﷺ", "ﷺ", "ﷺ", "ﷺ", "خانه ای"],
    );
  });

  it("covers stretched letters and diacritics in the original span", () => {
    const text = "سلاممممم قبلاً";
    const toks = standard.tokens(text);
    expect(toks.map((t) => text.slice(t.start, t.end))).toEqual(["سلاممممم", "قبلاً"]);
  });
});

describe("rejoining spaced affixes", () => {
  const words = (s: string) => tokenize(normalize(s)).map((t) => t.text);
  it("joins می/نمی to the next word and plural/comparative suffixes to the previous one", () => {
    expect(words("می روم نمی دانم")).toEqual([`می${Z}روم`, `نمی${Z}دانم`]);
    expect(words("کتاب ها بزرگ تر")).toEqual([`کتاب${Z}ها`, `بزرگ${Z}تر`]);
  });
  it("joins ای/ام/اند only after a vowel letter (not the vocative «ای خدا»)", () => {
    expect(words("نامه ای")).toEqual([`نامه${Z}ای`]);
    expect(words("خسته اید")).toEqual([`خسته${Z}اید`]);
    expect(words("گفت ای خدا")).toEqual(["گفت", "ای", "خدا"]);
  });
  it("never joins across punctuation or a line break", () => {
    expect(words("کتاب، ها")).toEqual(["کتاب", "ها"]);
    expect(words("می\nروم")).toEqual(["می", "روم"]);
  });
});

describe("variants analyze like their canonical form", () => {
  const cases: [string, string[]][] = [
    [`کتاب${Z}هایمان`, ["کتابهایمان", "کتاب هایمان", `كتاب${Z}هايمان`, "كتابهايمان"]],
    [`می${Z}روم`, ["میروم", "می روم", `مي${Z}روم`]],
    ["كيف", ["کیف"]],
    ["رئیس", ["رییس"]],
    [`نامه${Z}ی`, ["نامۀ", "نامهٔ", "نامه ی", "نامه"]],
    [`نامه${Z}ای`, ["نامه ای"]],
    ["۳۰", ["30", "٣٠"]],
  ];
  for (const [name, a] of [["standard", standard], ["full", full]] as const) {
    it.each(cases)(`${name}: %s`, (canonical, variants) => {
      for (const v of variants) expect(q(a, v), v).toEqual(q(a, canonical));
    });
  }

  it("full: tenses of one verb share a term", () => {
    for (const v of ["رفتم", "رفتند", "می‌روم", "میروم", "برود", "رفته", "رفتن"]) expect(q(full, v), v).toEqual(["رفت"]);
    for (const v of ["می‌کند", "کردند", "کرده‌اند", "بکنیم"]) expect(q(full, v), v).toEqual(["کرد"]);
  });

  it("full: keeps polarity by default, and merges it when asked", () => {
    expect(q(full, "نمی‌کند")).toEqual(["نکرد"]);
    expect(q(full, "نکرد")).toEqual(["نکرد"]);
    expect(q(createAnalyzer({ profile: "full", lexicon, negation: "merge" }), "نمی‌کند")).toEqual(["کرد"]);
  });

  it("full: joined «می» of a verb the lexicon lacks still matches its half-space spelling (rule fallback)", () => {
    const noVerbs = createAnalyzer({ profile: "full", lexicon: createLexicon("", "مهمان", "کتب>کتاب") });
    expect(q(noVerbs, "میکند")).toEqual(q(noVerbs, "می‌کند"));
  });

  it("full: broken plurals", () => {
    expect(q(full, "کتب")).toEqual(q(full, "کتاب"));
  });
});

describe("guard pairs stay distinct", () => {
  const pairs: [string, string][] = [["آسمان", "اسم"], ["ماهی", "ماه"], ["مهمان", "مهم"], ["هفته", "هفت"], ["مردم", "مرد"]];
  // The defaults index the madda-less spelling too (H7); queries must still keep these apart.
  const configs = { standard, full, "standard, no آ handling": createAnalyzer({ alefMadda: false }) };
  for (const [name, a] of Object.entries(configs)) {
    it.each(pairs)(`${name}: %s ≠ %s`, (x, y) => {
      if (name.startsWith("standard") && x === "مردم") return; // مردم/مرد only differ once verbs are analyzed
      expect(q(a, x)).not.toEqual(q(a, y));
    });
  }
  it("full: «بیست» (twenty) is not a form of بودن", () => {
    expect(q(full, "بیست")).not.toEqual(q(full, "بود"));
  });
});

describe("query terms are a subset of index terms", () => {
  const texts = [
    "آسمان آبی می‌شود", "قهوه‌ای سگهای برند",
    "کتاب‌خانه‌های مرکزی شهر", "می روم به کتابخانه", "نامه‌ای برای دوستان‌مان", "گوشی‌های سامسونگ ۱۲۸ گیگ",
    "نمی‌دانستند که هفته‌ی بعد", "كتاب هاي قديمي", "The iPhone 15 Pro", "زندگی‌اش را در آسمان‌خراش‌ها گذراند",
  ];
  const analyzers = {
    light, standard, full, keepCompounds: createAnalyzer({ zwnj: "keep", spellings: false, alefMadda: false }),
    verbsStem: createAnalyzer({ profile: "full", lexicon, verbs: "stem" }),
  };
  for (const [name, a] of Object.entries(analyzers)) {
    it(`${name}: query terms ⊆ index terms`, () => {
      for (const t of texts) {
        const index = new Set(a.analyze(t, { mode: "index" }));
        for (const term of a.analyze(t, { mode: "query" })) expect(index, `${t}: ${term}`).toContain(term);
      }
    });
  }
  it("verbs: stem keeps the tense, lemma merges it", () => {
    expect(q(analyzers.verbsStem, "می‌شود")).not.toEqual(q(analyzers.verbsStem, "شد"));
    expect(q(full, "می‌شود")).toEqual(q(full, "شد"));
  });
  it("index mode adds a compound's parts, the other half-space spelling and the madda-less spelling", () => {
    expect(new Set(standard.analyze("کتاب‌خانه", { mode: "index" }))).toEqual(new Set(["کتابخانه", "کتاب", "خانه"]));
    expect(standard.analyze("قهوه‌ای", { mode: "index" })).toContain(q(standard, "قهوهای")[0]);
    expect(standard.analyze("آسمان", { mode: "index" })).toContain(q(standard, "اسمان")[0]);
    expect(q(standard, "آسمان")).toEqual(["آسمان"]);
  });
  it("query mode emits one term per token", () => {
    const a = standard;
    for (const t of texts) expect(a.analyze(t, { mode: "query" }).length).toBe(a.tokens(t).length);
  });
});

describe("the stemmer", () => {
  it("still sees the ZWNJ: Snowball strips می only after one", () => {
    const snowballOnly = new Stemmer({ joinedMi: "zwnj" });
    expect(snowballOnly.stem(`می${Z}کنند`)).not.toBe(snowballOnly.stem("میکنند"));
    expect(q(createAnalyzer({ joinedMi: "zwnj" }), "می‌کنند")).toEqual([snowballOnly.stem(`می${Z}کنند`)]);
  });

  it("stems the part before a ZWNJ + closed suffix, not the whole word", () => {
    // Snowball alone: «نامه‌ای» → «نام», «خسته‌اید» → «خست».
    expect(q(standard, `نامه${Z}ای`)).toEqual(["نامه"]);
  });

  it("leaves the joined ezafe «هی» alone (ماهی is fish, not ماه + ی)", () => {
    expect(q(standard, "ماهی")).toEqual(["ماهی"]);
  });

  it("strips joined می by rule, but not from listed non-verbs", () => {
    expect(q(standard, "میکند")).toEqual(q(standard, "می‌کند"));
    expect(q(standard, "میلادی")).toEqual(["میلادی"]);
    expect(q(standard, "میلیون")).toEqual(["میلیون"]);
    expect(q(standard, "میلی")).toEqual(["میلی"]); // a prefix entry covers the word itself
  });

  it("full needs a lexicon", () => {
    expect(() => createAnalyzer({ profile: "full" })).toThrow(/lexicon/);
  });
});
