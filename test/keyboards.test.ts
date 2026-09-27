import { describe, expect, it } from "vitest";
import {
  LAYOUTS,
  MAC_STANDARD,
  ZWNJ,
  latinToPersian,
  persianToLatin,
  type Layout,
} from "../bench/lib/keyboards.ts";

const byId = (id: string): Layout => {
  const layout = LAYOUTS.find((l) => l.id === id);
  if (!layout) throw new Error(`no layout ${id}`);
  return layout;
};
const isiri = byId("isiri9147");
const legacy = byId("win-legacy");
const mac = byId("mac-legacy");
const ALL = [...LAYOUTS, MAC_STANDARD];

// The 47 printable keys of the US ANSI main block, unshifted and shifted.
const US_BASE = "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./";
const US_SHIFT = '~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:"ZXCVBNM<>?';

// The 32 letters of the Persian alphabet (Persian yeh and keheh), plus the
// alef/hamza forms every layout must be able to type.
const PERSIAN_LETTERS = [..."ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی", "آ", "ئ", "ء"];

/** Every single-character output of a layer, with the keys producing it. */
function targets(layer: Record<string, string>): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  for (const [key, out] of Object.entries(layer)) {
    if (out === "") continue; // key produces nothing
    seen.set(out, [...(seen.get(out) ?? []), key]);
  }
  return seen;
}

describe("layout tables", () => {
  it("exports the three benchmark layouts", () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual(["isiri9147", "win-legacy", "mac-legacy"]);
  });

  it.each(ALL.map((l) => [l.id, l] as const))("%s lists every US key in both layers", (_id, layout) => {
    expect(Object.keys(layout.base).sort()).toEqual([...US_BASE].sort());
    expect(Object.keys(layout.shift).sort()).toEqual([...US_SHIFT].sort());
  });

  it.each(ALL.map((l) => [l.id, l] as const))("%s can type every Persian letter", (_id, layout) => {
    const reachable = new Set([...Object.values(layout.base), ...Object.values(layout.shift)]);
    for (const letter of PERSIAN_LETTERS) expect(reachable, `missing ${letter}`).toContain(letter);
  });

  it.each(ALL.map((l) => [l.id, l] as const))("%s has no duplicate targets within a layer", (_id, layout) => {
    // The only real duplicate: macOS "Persian – Legacy" puts أ on both
    // Shift+B and Shift+N (read from the OS, not a transcription error).
    const allowed = layout.id === "mac-legacy" ? new Set(["أ"]) : new Set<string>();
    for (const layer of [layout.base, layout.shift]) {
      for (const [out, keys] of targets(layer)) {
        if (keys.length > 1 && !allowed.has(out)) {
          throw new Error(`${layout.id}: ${JSON.stringify(out)} on ${keys.join(" ")}`);
        }
      }
    }
  });

  it("emits Persian yeh U+06CC on d and keheh U+06A9 on ; everywhere", () => {
    for (const layout of ALL) {
      expect(layout.base["d"]).toBe("ی");
      expect(layout.base[";"]).toBe("ک");
    }
  });

  it("records where Arabic yeh and kaf live", () => {
    expect(isiri.shift["D"]).toBe("ي");
    expect(isiri.shift["Z"]).toBe("ك");
    expect(legacy.shift["X"]).toBe("ي");
    expect(Object.values(legacy.shift)).not.toContain("ك");
    expect(mac.shift["D"]).toBe("ي");
    // The Shift+R ligature on legacy Windows is spelled with Arabic yeh.
    expect(legacy.shift["R"]).toBe("ريال");
    expect(isiri.shift["$"]).toBe("ریال");
  });

  it("puts the bottom row where each source says", () => {
    expect(latinToPersian("zxcvbnm,./", isiri)).toBe("ظطزرذدپو./");
    expect(latinToPersian("zxcvbnm,./\\", legacy)).toBe("ظطزرذدئو./پ");
    expect(latinToPersian("zxcvbnm,./`", mac)).toBe("ظطذدزرو،.ژپ");
    expect(latinToPersian("zxcvbnm,./", MAC_STANDARD)).toBe(latinToPersian("zxcvbnm,./", isiri));
  });
});

describe("latinToPersian / persianToLatin", () => {
  it("reproduces the Triboon examples on the standard layout", () => {
    expect(latinToPersian("nd[d", isiri)).toBe("دیجی");
    expect(latinToPersian(";ta", isiri)).toBe("کفش");
    expect(persianToLatin("دیجی", isiri)).toBe("nd[d");
    expect(persianToLatin("کفش", isiri)).toBe(";ta");
  });

  it("gives the same Triboon result on legacy Windows, and a different one on Mac", () => {
    expect(latinToPersian("nd[d", legacy)).toBe("دیجی");
    expect(latinToPersian(";ta", legacy)).toBe("کفش");
    expect(latinToPersian("nd[d", mac)).toBe("ریجی");
    expect(persianToLatin("دیجی", mac)).toBe("vd[d");
  });

  it("handles ZWNJ per layout", () => {
    // م ی ZWNJ ر و م
    expect(persianToLatin("می\u200Cروم", isiri)).toBe("ld v,l");
    expect(persianToLatin("می\u200Cروم", legacy)).toBe("ldv,l");
    expect(persianToLatin("می\u200Cروم", mac)).toBe("ld nml");
    // Shift+B is ZWNJ on the standard layout; a space stays a space.
    expect(latinToPersian("ld v,l", isiri)).toBe("می روم");
    expect(latinToPersian("ldBv,l", isiri)).toBe(`می${ZWNJ}روم`);
  });

  it("passes unmapped characters through", () => {
    expect(latinToPersian("é 12\n", isiri)).toBe("é ۱۲\n");
    expect(latinToPersian("é 12\n", legacy)).toBe("é 12\n");
    expect(persianToLatin("abc 🙂", isiri)).toBe("abc 🙂");
  });

  it("drops keys that produce nothing", () => {
    expect(latinToPersian("aFb", mac)).toBe("شز");
  });

  it("types ligatures letter by letter in reverse", () => {
    expect(persianToLatin("ریال", isiri)).toBe("vdhg");
    expect(persianToLatin("ريال", legacy)).toBe("vXhg");
  });

  const WORDS = ["کتاب", "دیجی\u200Cکالا", "پژوهش", "چای", "آبی", "مسئول", "گفت\u200Cوگو", "ذرت", "ظرف", "۱۴۰۳"];

  it.each(ALL.map((l) => [l.id, l] as const))("%s round-trips Persian words", (_id, layout) => {
    for (const word of WORDS) {
      const expected = word.replaceAll(ZWNJ, layout.zwnjOnUs);
      expect(latinToPersian(persianToLatin(word, layout), layout)).toBe(expected);
    }
  });

  it.each(ALL.map((l) => [l.id, l] as const))("%s round-trips every key output", (_id, layout) => {
    for (const layer of [layout.base, layout.shift]) {
      for (const out of Object.values(layer)) {
        if ([...out].length !== 1 || out === ZWNJ) continue;
        expect(latinToPersian(persianToLatin(out, layout), layout)).toBe(out);
      }
    }
  });

  it.each(ALL.map((l) => [l.id, l] as const))("%s round-trips lowercase Latin", (_id, layout) => {
    const latin = "the quick brown fox jumps over the lazy dog";
    expect(persianToLatin(latinToPersian(latin, layout), layout)).toBe(latin);
  });
});
