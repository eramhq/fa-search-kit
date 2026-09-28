/**
 * Query rescue: keyboard layouts, the speller, the word list, analytics keys, and
 * each engine with its real engine finding the target of a typo'd and a
 * wrong-keyboard query.
 */
import { create, insertMultiple, search as oramaSearch } from "@orama/orama";
import FlexSearch from "flexsearch";
import lunr from "lunr";
import MiniSearch from "minisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPagefind, type LoadedPagefind } from "../bench/lib/pagefind.ts";
import { LAYOUTS as REFERENCE, latinToPersian, persianToLatin } from "../bench/lib/keyboards.ts";
import { createAnalyzer } from "../src/analyzer.ts";
import { canonicalKey } from "../src/analytics.ts";
import { faDocument } from "../src/adapters/flexsearch.ts";
import { faLunr } from "../src/adapters/lunr.ts";
import { faMiniSearch } from "../src/adapters/minisearch.ts";
import { faTokenizer } from "../src/adapters/orama.ts";
import { faPagefind } from "../src/adapters/pagefind.ts";
import { faPagefindIndex } from "../src/adapters/pagefind-build.ts";
import { pagefindKnows } from "../src/adapters/pagefind-rescue.ts";
import { adapterAnalyzer } from "../src/adapters/shared.ts";
import { lexicon } from "../src/lexicon/index.ts";
import { normalize } from "../src/normalize.ts";
import { createWordList } from "../src/rescue/build.ts";
import { LAYOUTS, keyboardCandidates, toLatin, toPersian } from "../src/rescue/keyboard.ts";
import { createRescue, fetchWords } from "../src/rescue/index.ts";
import { distance, spell } from "../src/rescue/speller.ts";
import { WordList, decodePiece, piecesFor, wordKey } from "../src/rescue/words.ts";

const Z = "\u200c";

describe("keyboard", () => {
  it("Latin typed while meaning Persian", () => {
    expect(keyboardCandidates("nd[d")).toContain("دیجی");
    expect(keyboardCandidates("Chmk")[0]).toBe("ژاپن"); // Shift+C is ژ on the standard layout
    expect(keyboardCandidates("Nd[d")).toContain("دیجی"); // a phone capitalized the first letter
    expect(keyboardCandidates(",v;")).toContain("ورک"); // mac legacy moved و and ر
    expect(keyboardCandidates("nd[d").length).toBeLessThanOrEqual(3);
    // A key that types nothing, or a Latin letter left over: no candidate.
    expect(keyboardCandidates("F41")).not.toContain("41");
    expect(keyboardCandidates("BRN").every((c) => !/[A-Z]/i.test(c))).toBe(true);
    expect(keyboardCandidates("S70")).toEqual([]); // Shift+S types a letter on one layout only: a code, not a word
    expect(keyboardCandidates("M24")).toEqual([]);
    expect(keyboardCandidates("1;dg,'vl")).toContain("1کیلوگرم");
  });

  it("Persian letters that spell a Latin name", () => {
    expect(keyboardCandidates(toPersian("samsung", LAYOUTS.isiri9147!))).toEqual(["samsung"]);
    expect(keyboardCandidates("س۲۳")).toEqual(["s23"]);
    expect(keyboardCandidates("کتاب")).toEqual([]); // «;jhf»: no name
    expect(keyboardCandidates("طحویل")).toEqual(["xpmdg"]); // mac legacy; «xp,dg» on the others is no name
  });

  it("the compact tables are the reference tables on every key that types a letter", () => {
    const keys = "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?";
    const letter = /[\u0621-\u063a\u0641-\u064a\u067e\u0686\u0698\u06a9\u06af\u06c0\u06cc\u200c]/;
    for (const ref of REFERENCE) {
      const compact = LAYOUTS[ref.id]!;
      let letters = 0;
      for (const key of keys) {
        const want = latinToPersian(key, ref);
        if ([...want].length !== 1 || !letter.test(want)) continue; // digits, punctuation, marks: pass through
        letters++;
        expect(toPersian(key, compact), `${ref.id} ${key}`).toBe(want);
      }
      expect(letters, ref.id).toBeGreaterThanOrEqual(38);
      for (const ch of "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیآئءؤأإيكة") {
        if (persianToLatin(ch, ref) !== ch) expect(toLatin(ch, compact), `${ref.id} ${ch}`).toBe(persianToLatin(ch, ref));
      }
    }
  });
});

describe("speller", () => {
  const list = new WordList();
  const analyzer = createAnalyzer();
  for (const text of ["تحویل تحویل کالا در اهواز", "صابون صابون صابون گیاهی", "کتابخانه مرکزی", "حراج تابستانه", "سد کرج"]) for (const t of analyzer.tokens(text)) list.add(t.text);
  const fix = (w: string) => spell(wordKey(w), piecesFor(wordKey(w), 1).map((k) => list.piece(k)))?.[0];

  it("fixes sound-alike letters, missing letters, swaps", () => {
    expect(fix("طحویل")).toBe("تحویل"); // two sound-alike swaps
    expect(fix("اهاز")).toBe("اهواز");
    expect(fix("تحیول")).toBe("تحویل");
    expect(fix("سابون")).toBe("صابون"); // first letter, same sound-alike class
    expect(fix("کتابخانخ")).toBe("کتابخانه"); // neighbouring key
  });

  it("leaves words alone that are on the site or have no close word", () => {
    expect(fix("تحویل")).toBeUndefined();
    expect(fix("بلبل")).toBeUndefined();
    expect(fix("صد")).toBeUndefined(); // 2 letters
    expect(fix("ثد")).toBeUndefined();
    expect(spell("سدد", [list.piece("2.3")])).toBeUndefined(); // 3 letters: only a sound-alike swap
    expect(spell("صد", [list.piece("2.3")])).toBeUndefined();
  });

  it("costs: sound-alike < neighbouring key < other", () => {
    expect(distance("سابون", "صابون", 1)).toBeCloseTo(0.3);
    expect(distance("کتابخانخ", "کتابخانه", 1)).toBeCloseTo(0.6);
    expect(distance("کتابخانب", "کتابخانه", 1)).toBe(1);
    expect(distance("کتاب", "کتابخانه", 1)).toBe(Infinity);
  });
});

describe("word list", () => {
  const pages = ["کتاب\u200cخانه\u200cی آستان", "کتاب\u200cخانه کتابخانه", "آسمان آبی و اسمان", "برای ۲۰ samsung"];

  it("keys drop ZWNJ and madda; the most common spelling is kept; 3+ Persian letters only", () => {
    const w = createWordList();
    for (const p of pages) w.add(p);
    const all = new Map([...w.list.pieces.values()].flatMap((p) => [...p]));
    expect(all.get("کتابخانه")).toEqual([`کتاب${Z}خانه`, 2]);
    expect(all.get("اسمان")).toEqual(["آسمان", 2]);
    expect([...all.keys()].sort()).toEqual(["ابی", "استان", "اسمان", "برای", "کتابخانه", "کتابخانهی"].sort());
  });

  it("built pieces round-trip through fetchWords, downloaded only when asked", async () => {
    const w = createWordList();
    for (const p of pages) w.add(p);
    const files = w.files();
    expect(Object.keys(JSON.parse(new TextDecoder().decode(files.get("index.json")!)))).toEqual(["v", "hash", "keys"]);
    expect([...files.keys()].every((f) => /^(index\.json|\d+\.\d+\.[\da-f]{10}\.bin)$/.test(f))).toBe(true);
    const asked: string[] = [];
    const fetched = fetchWords("https://site.example/fa-words/", async (url, init) => {
      const name = String(url).split("/").pop()!;
      asked.push(name);
      // The manifest is always revalidated (its name survives a rebuild); pieces carry a hash.
      expect(init?.cache).toBe(name === "index.json" ? "no-cache" : undefined);
      return files.has(name) ? new Response(files.get(name) as Uint8Array<ArrayBuffer>) : new Response(null, { status: 404 });
    });
    expect(fetched.bytes).toBe(0);
    const piece = await fetched.piece(piecesFor("کتابخانه", 0)[0]!);
    expect(piece?.get("کتابخانه")).toEqual([`کتاب${Z}خانه`, 2]);
    expect(await fetched.piece("999.3")).toBeUndefined(); // not in the manifest: not requested
    expect(asked).toHaveLength(2);
    expect(fetched.bytes).toBeGreaterThan(0);
  });

  it("decodes front-coded lines", () => {
    expect([...decodePiece("0کتاب3\n4ها0\n")]).toEqual([["کتاب", ["کتاب", 8]], ["کتابها", ["کتابها", 1]]]);
  });
});

describe("createRescue", () => {
  const analyzer = adapterAnalyzer({ lexicon }, "lemma");
  const rescue = createRescue({ analyzer });
  for (const t of ["تحویل کالا در اهواز", "دیجی کالا فروشگاه", "صابون گیاهی", "کتاب\u200cخانه\u200cی مرکزی شهر", "كتابهاي قديمي", "گوشی samsung galaxy s23", "ژاپن و چین"]) rescue.addText(t);
  const to = async (q: string, found = 0) => (await rescue.check(q, found))?.to;

  it("fixes wrong keyboard and typos", async () => {
    expect(await to("nd[d ;hgh")).toBe("دیجی کالا");
    expect(await to("Chmk")).toBe("ژاپن");
    expect(await to("طحویل کالا", 1)).toBe("تحویل کالا");
    expect(await to("گوشی سشپسعدل", 1)).toBe("گوشی samsung");
    expect(await to("سابون")).toBe("صابون");
  });

  it("takes one layout for the whole query, not each run's first known candidate", async () => {
    const r = createRescue({ analyzer });
    // «شر» (standard layout for «av») is on the site too; the query was typed on mac legacy («شد»).
    for (const t of ["مکعب صنایع تحویل شد", "شر"]) r.addText(t);
    expect((await r.check("l;uf wkhdu jpmdg av", 0))?.to).toBe("مکعب صنایع تحویل شد");
  });

  it("suspects (R9): with nothing found, a rare known word near one 10× as common", async () => {
    const r = createRescue({ analyzer });
    r.addText("فاصله ".repeat(12) + "اجتماعی فصله");
    expect((await r.check("فصله اجتماعی", 0))?.to).toBe("فاصله اجتماعی");
    expect(await r.check("فصله اجتماعی", 1)).toBeUndefined(); // found something: not weak
    r.addText("فصله");
    r.addText("فصله");
    expect(await r.check("فصله اجتماعی", 0)).toBeUndefined(); // 12 vs 3: not 10×
  });

  it("3-letter words: a sound-alike swap only", async () => {
    const r = createRescue({ analyzer });
    r.addText("برنج وارداتی صد");
    expect(await r.check("بنج", 0)).toBeUndefined();
    expect((await r.check("سد", 0))).toBeUndefined(); // 2 letters
  });

  it("never fixes what the index knows, spelled any way the analyzer handles", async () => {
    for (const q of ["کتابخانه", "کتاب\u200cهایم", "كتاب", "کتابهای قدیمی", "دیجی", "samsung", "S23", "تحویل"]) expect(await to(q, 0), q).toBeUndefined();
  });

  it("leaves unknown Latin, digits and short words alone", async () => {
    for (const q of ["iphone", "a52", "۱۴۰۲", "tv", "فر"]) expect(await to(q), q).toBeUndefined();
  });

  it("a weak search needs an unknown word, or nothing found", async () => {
    expect(await to("صابون گیاهی", 3)).toBeUndefined();
    expect(await to("سابون گیاهی", 3)).toBe("صابون گیاهی");
  });

  it("rescueSearch keeps a fix only when it finds something", async () => {
    const r = await rescue.rescueSearch((q) => (q.includes("صابون") ? ["c"] : []), "سابون");
    expect(r).toMatchObject({ results: ["c"], query: "صابون", fix: { from: "سابون", to: "صابون" } });
    const none = await rescue.rescueSearch(() => [], "سابون");
    expect(none).toEqual({ results: [], query: "سابون" });
  });
});

describe("canonicalKey", () => {
  it("groups spellings of one query", () => {
    expect(canonicalKey("كتاب")).toBe(canonicalKey("کتاب"));
    expect(canonicalKey("کتابها")).toBe(canonicalKey("کتاب"));
    expect(canonicalKey("کتاب قدیمی")).toBe(canonicalKey("قديمي  كتاب"));
    expect(canonicalKey("کتاب")).toMatch(/^1:/);
    expect(canonicalKey("کتاب", { prefix: "site2" })).toBe("site2:کتاب");
  });
});

// --- every engine with its real engine ----------------------------------------------

const DOCS = [
  { id: "a", title: "تحویل کالا در اهواز", body: "ارسال سریع" },
  { id: "b", title: "دیجی کالا", body: "فروشگاه اینترنتی" },
  { id: "c", title: "صابون گیاهی", body: "دست\u200cساز" },
  { id: "d", title: "گوشی samsung", body: "galaxy s23" },
  { id: "e", title: "ماشین قرمز", body: "خودرو" },
];
/** Typo'd and wrong-keyboard queries → the doc they must find first (as typed it is not first). */
const CASES: [string, string][] = [["طحویل کالا", "a"], ["nd[d", "b"], ["سابون", "c"], ["سشپسعدل", "d"]];
const text = (d: (typeof DOCS)[number]) => `${d.title} ${d.body}`;

type Search = (q: string) => Promise<string[]> | string[];
async function expectRescues(search: Search, verbs: "lemma" | "stem") {
  const rescue = createRescue({ analyzer: adapterAnalyzer({}, verbs) });
  for (const d of DOCS) rescue.addText(text(d));
  for (const [q, id] of CASES) {
    expect((await search(q))[0], `${q} as typed`).not.toBe(id);
    const r = await rescue.rescueSearch(search, q);
    expect(r.results[0], q).toBe(id);
    expect(r.fix?.from).toBe(q);
  }
}

describe("each engine rescues", () => {
  it("orama", async () => {
    const db = create({ schema: { title: "string", body: "string" } as const, components: { tokenizer: faTokenizer() } });
    await insertMultiple(db, DOCS);
    await expectRescues(async (q) => (await oramaSearch(db, { term: q, properties: ["title", "body"] })).hits.map((h) => h.id), "stem");
  });

  it("minisearch", async () => {
    const ms = new MiniSearch({ fields: ["title", "body"], ...faMiniSearch() });
    ms.addAll(DOCS);
    await expectRescues((q) => ms.search(q).map((r) => String(r.id)), "stem");
  });

  it("flexsearch", async () => {
    const index = faDocument(FlexSearch, { document: { id: "id", index: ["title", "body"] } });
    for (const d of DOCS) index.add(d as never);
    await expectRescues((q) => (index.search(q, { merge: true } as never) as unknown as { id: string }[]).map((r) => r.id), "lemma");
  });

  it("lunr", async () => {
    const fa = faLunr(lunr);
    const idx = lunr(function () { this.use(fa); this.ref("id"); this.field("title"); this.field("body"); for (const d of DOCS) this.add(d); });
    await expectRescues((q) => fa.search(idx, q).map((r) => r.ref), "stem");
  });

  describe("pagefind (probe + built word list)", () => {
    const fa = faPagefind();
    const words = createWordList();
    let pf: LoadedPagefind;
    beforeAll(async () => {
      pf = await buildPagefind(async (index) => {
        const pages = DOCS.map((d) => ({ url: `/${d.id}/`, content: `<html lang="fa"><body><nav>منو ناوبری</nav><main data-pagefind-body><h1>${d.title}</h1><p>${d.body}</p></main></body></html>` }));
        expect(await faPagefindIndex({ words }).addPages(index, [...pages, { url: "/x/", content: "<html><body><p>صفحه\u200cای بیرون از جست\u200cوجو</p></body></html>" }])).toEqual([]);
      });
    }, 60_000);
    afterAll(() => pf?.close());
    const search = async (q: string) => {
      const res = await pf.search(fa.processQuery(q));
      return Promise.all(res.results.slice(0, 3).map(async (r) => (await r.data()).url.split("/").at(-2)!));
    };

    it("the word list holds exactly the indexed text", () => {
      const keys = [...words.list.pieces.values()].flatMap((p) => [...p.keys()]);
      expect(keys).toContain("تحویل");
      expect(keys).not.toContain("ناوبری"); // nav
      expect(keys).not.toContain("بیرون"); // a page Pagefind skips (no data-pagefind-body)
    });

    it("finds the targets", async () => {
      const files = words.files();
      const source = fetchWords("https://x/fa-words/", async (url) => new Response(files.get(String(url).split("/").pop()!) as Uint8Array<ArrayBuffer>));
      const rescue = createRescue({ analyzer: adapterAnalyzer({}, "lemma"), words: source, isKnown: pagefindKnows(pf, fa) });
      for (const [q, id] of CASES) {
        const r = await rescue.rescueSearch(search, q);
        expect(r.results, q).toContain(id);
      }
      // Pagefind finds an unknown word through a shorter prefix, so a result count cannot say "unknown".
      expect((await pf.search(fa.processQuery("اهوازی"))).results.length).toBeGreaterThan(0);
      expect(await pagefindKnows(pf, fa)("اهوازی")).toBe(false);
      expect(await pagefindKnows(pf, fa)("اهواز")).toBe(true);
      expect(await pagefindKnows(pf, fa)("اهوا")).toBe(true); // a Persian prefix: Pagefind finds «اهواز» with it
      expect(await pagefindKnows(pf, fa)("samsung")).toBe(true);
      expect(await pagefindKnows(pf, fa)("sam")).toBe(false); // a Latin term must be a whole word
      expect(source.bytes).toBeGreaterThan(0);
    });
  });
});
