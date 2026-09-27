/**
 * Each adapter with its real engine: a small Persian set indexed and queried the
 * way a site would, and query terms ⊆ index terms through the adapter.
 */
import { create, insertMultiple, search as oramaSearch } from "@orama/orama";
import FlexSearch from "flexsearch";
import lunr from "lunr";
import MiniSearch from "minisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPagefind, type LoadedPagefind } from "../bench/lib/pagefind.ts";
import { faDocument, faEncode } from "../src/adapters/flexsearch.ts";
import { faLunr } from "../src/adapters/lunr.ts";
import { faMiniSearch } from "../src/adapters/minisearch.ts";
import { faTokenizer } from "../src/adapters/orama.ts";
import { faPagefind } from "../src/adapters/pagefind.ts";
import { faPagefindIndex } from "../src/adapters/pagefind-build.ts";
import { lexicon } from "../src/lexicon/index.ts";

const Z = "‌";
const DOCS = [
  { id: "a", title: "كتابهاي قديمي", body: `در كتاب${Z}خانه‌ی شهر` },
  { id: "b", title: "آسمان آبی", body: `می${Z}روم به خانه` },
  { id: "c", title: "قیمت ۳۰ هزار", body: "تومان" },
  { id: "d", title: `کتاب${Z}هایمان را خواندیم`, body: "داستان" },
  { id: "e", title: "ماشین قرمز", body: "خودرو" },
];
/** Query → the doc it must find (in the top 3). */
const CASES: [string, string][] = [
  ["کتاب قدیمی", "a"], // Arabic ي/ك on the page
  ["می روم", "b"], // half-space typed as a space
  ["میروم", "b"], // joined
  ["کتابهایمان", "d"], // no half-space, plural + clitic
  ["اسمان", "b"], // آ typed without its madda
  ["30", "c"], // Latin digits for Persian ones
];
const ZWNJ_SPACE: [string, string] = ["کتاب خانه", "a"]; // needs a compound's parts at index time

type Search = (q: string) => Promise<string[]> | string[];
const expectFinds = async (search: Search, cases: [string, string][]) => {
  for (const [q, id] of cases) expect((await search(q)).slice(0, 3), q).toContain(id);
};

describe("orama", () => {
  const build = async (exactTerms?: boolean, docs = DOCS) => {
    const db = create({ schema: { title: "string", body: "string" } as const, components: { tokenizer: faTokenizer({ exactTerms }) } });
    await insertMultiple(db, docs);
    return async (q: string) => (await oramaSearch(db, { term: q, properties: ["title", "body"], boost: { title: 2 } })).hits.map((h) => h.id);
  };

  it("finds the variants", async () => {
    await expectFinds(await build(), [...CASES, ZWNJ_SPACE]);
  });

  it("index mode with a property, query mode without; query ⊆ index", () => {
    const t = faTokenizer();
    const text = `کتاب${Z}خانه‌ها و آسمان`;
    const index = t.tokenize(text, undefined, "title"), query = t.tokenize(text);
    expect(index.length).toBeGreaterThan(query.length);
    for (const term of query) expect(index).toContain(term);
    expect(query.every((x) => x.endsWith("_"))).toBe(true);
    expect(faTokenizer({ exactTerms: false }).tokenize(text).some((x) => x.endsWith("_"))).toBe(false);
  });

  it("sentinel on: a term matches only itself; off: Orama's prefix match returns", async () => {
    const docs = [{ id: "x", title: "کتابخانه مرکزی", body: "" }];
    expect(await (await build(undefined, docs))("کتاب")).toEqual([]);
    expect(await (await build(false, docs))("کتاب")).toEqual(["x"]);
  });

  it("repeated query words count once", () => {
    expect(faTokenizer().tokenize("کتاب کتاب کتابها")).toEqual(["کتاب_"]);
  });
});

describe("minisearch", () => {
  const build = (combineWith?: "AND") => {
    const fa = faMiniSearch({ combineWith, lexicon });
    const ms = new MiniSearch({ fields: ["title", "body"], ...fa, searchOptions: { ...fa.searchOptions, boost: { title: 2 } } });
    ms.addAll(DOCS);
    return (q: string) => ms.search(q).map((r) => String(r.id));
  };

  it("finds the variants (OR and AND)", async () => {
    await expectFinds(build(), [...CASES, ZWNJ_SPACE]);
    await expectFinds(build("AND"), [...CASES, ZWNJ_SPACE]);
  });

  it("query ⊆ index", () => {
    const fa = faMiniSearch();
    const text = `نامه‌ای در کتاب${Z}خانه`;
    const index = fa.tokenize(text);
    for (const term of fa.searchOptions.tokenize(text)) expect(index).toContain(term);
  });

  it("verbs: stem with OR, lemma with AND (full profile)", () => {
    expect(faMiniSearch({ lexicon }).searchOptions.tokenize("می‌روم")).not.toEqual(["رفت"]);
    expect(faMiniSearch({ lexicon, combineWith: "AND" }).searchOptions.tokenize("می‌روم")).toEqual(["رفت"]);
    expect(faMiniSearch({ combineWith: "AND" }).searchOptions.combineWith).toBe("AND");
  });
});

describe("flexsearch", () => {
  const fields = { document: { id: "id", index: ["title", "body"] } };

  it("faDocument: index mode on add, query mode on search", async () => {
    const index = faDocument(FlexSearch, fields);
    for (const d of DOCS) index.add(d as never);
    const search = (q: string) => (index.search(q, { merge: true } as never) as unknown as { id: string }[]).map((r) => r.id);
    await expectFinds(search, [...CASES, ZWNJ_SPACE]);
  });

  it("faDocument keeps other options and the stored document", () => {
    const index = faDocument(FlexSearch, { ...fields, document: { ...fields.document, store: true } });
    index.add(DOCS[0] as never);
    expect((index as unknown as { get(id: string): unknown }).get("a")).toEqual(DOCS[0]);
  });

  it("faEncode drop-in: query mode on both sides, so none of index mode's extra terms", async () => {
    const index = new FlexSearch.Document({ ...fields, encode: faEncode() } as never);
    for (const d of DOCS) index.add(d as never);
    const search = (q: string) => (index.search(q, { merge: true } as never) as unknown as { id: string }[]).map((r) => r.id);
    await expectFinds(search, CASES.filter(([q]) => q !== "اسمان"));
    expect(search(ZWNJ_SPACE[0])).not.toContain("a"); // a compound's parts
    expect(search("اسمان")).not.toContain("b"); // the madda-less spelling
  });

  it("verbs default to lemma", () => {
    expect(faEncode({ lexicon })("رفتم")).toEqual(faEncode({ lexicon })("می‌روم"));
  });
});

describe("lunr", () => {
  const fa = faLunr(lunr);
  const idx = lunr(function () {
    this.use(fa);
    this.ref("id");
    this.field("title", { boost: 2 });
    this.field("body");
    for (const d of DOCS) this.add(d);
  });
  const search = (q: string) => fa.search(idx, q).map((r) => r.ref);

  it("finds the variants", async () => {
    await expectFinds(search, [...CASES, ZWNJ_SPACE]);
  });

  it("query syntax characters are text, not operators", () => {
    for (const q of ["کتاب:قدیمی", "کتاب~2", "^کتاب", "+کتاب -آسمان", "کتاب*", "title:کتاب", "\\", ""]) expect(() => search(q)).not.toThrow();
    expect(search("+کتاب -قدیمی")).toContain("a");
    expect(search("")).toEqual([]);
  });
});

describe("pagefind", () => {
  const fa = faPagefind();
  const ix = faPagefindIndex();
  let pf: LoadedPagefind;
  const page = (d: (typeof DOCS)[number]) =>
    `<!doctype html><html lang="fa"><head><title>${d.title}</title></head><body><h1>${d.title}</h1><p>${d.body}</p></body></html>`;
  beforeAll(async () => {
    pf = await buildPagefind(async (index) => {
      expect(await ix.addPages(index, DOCS.map((d) => ({ url: `/${d.id}/`, content: page(d) })))).toEqual([]);
    });
  }, 60_000);
  afterAll(() => pf?.close());
  const search = async (q: string) => {
    const res = await pf.search(fa.processQuery(q));
    return Promise.all(res.results.slice(0, 3).map(async (r) => (await r.data()).url.split("/").at(-2)!));
  };

  it("finds the variants", async () => {
    await expectFinds(search, [...CASES, ZWNJ_SPACE]);
  });

  it("processResult rebuilds excerpts from the visible text", async () => {
    const res = await pf.search(fa.processTerm("کتابخانه"));
    const data = fa.processResult(await res.results[0]!.data());
    expect(data.excerpt).not.toMatch(/[⁅⁆]/);
    expect(data.excerpt).toContain(`<mark>كتاب${Z}خانه‌ی</mark>`);
  });

  it("annotateHtml keeps the page, adds hidden blocks, and is idempotent", () => {
    const html = page(DOCS[0]!);
    const once = ix.annotateHtml(html);
    expect(once.replace(/<(div|span) hidden data-fa-search[^>]*>[^<]*<\/\1>/g, "")).toBe(html);
    expect(once).toContain('data-pagefind-weight="7"'); // the h1's terms keep its weight
    expect(ix.annotateHtml(once)).toBe(once);
  });

  it("a heading's terms keep its weight even when the body has the same word", () => {
    const all = faPagefindIndex({ terms: "all", title: "keep", surface: false }).annotateHtml("<body><h1>كاغذ يادداشت</h1><p>کاغذ کاغذ</p></body>");
    expect(all).toContain('<div hidden data-fa-search>⁅کاغذ کاغذ⁆</div>');
    expect(all).toContain('<div hidden data-fa-search data-pagefind-weight="7">⁅کاغذ یادداشت⁆</div>');
    // "new": only what Pagefind would not already index at that weight.
    expect(faPagefindIndex({ terms: "new", title: "keep" }).annotateHtml("<body><h1>كاغذ</h1><p>کاغذ</p></body>")).toBe(
      '<body><h1>كاغذ</h1><p>کاغذ</p><div hidden data-fa-search data-pagefind-weight="7">⁅کاغذ⁆</div></body>',
    );
  });

  it("default layout: all terms, plus the normalized spelling of words Pagefind reads differently", () => {
    const html = "<body><p>کتاب مريم حسينيان و کتابها</p></body>";
    expect(faPagefindIndex({ title: "keep" }).annotateHtml(html)).toContain("<div hidden data-fa-search>⁅کتاب مریم حسین و کتاب حسینیان⁆</div>");
    // "new": «کتاب», «کتابها» and «و» are already words of the page; «حسينيان» is not, in either spelling.
    expect(faPagefindIndex({ terms: "new", title: "keep" }).annotateHtml(html)).toContain("<div hidden data-fa-search>⁅مریم حسین حسینیان⁆</div>");
    expect(faPagefindIndex({ title: "keep", surface: false }).annotateHtml("<body><p>مريم</p></body>")).toContain("⁅مریم⁆");
  });

  it("an ignored inline element still separates the words around it", () => {
    expect(faPagefindIndex({ terms: "all" }).annotateHtml("<body><p>گفتم<b data-pagefind-ignore>—</b>نیامد</p></body>")).toContain("⁅گفتم نیامد⁆");
  });

  it("title option: the ranked title meta, the real title kept for display", () => {
    const html = `<html><head><title>سایت</title></head><body><h1>كتابهاي <b>قديمي</b>, جلد ۲</h1><p>متن</p></body></html>`;
    const terms = faPagefindIndex({ title: "terms" }).annotateHtml(html);
    expect(terms).toContain('data-fa-title="کتاب کتابه قدیمی جلد 2" data-fa-original="كتابهاي قديمي, جلد ۲"');
    expect(faPagefindIndex({ title: "terms" }).annotateHtml(terms)).toBe(terms);
    expect(faPagefindIndex({ title: "fold" }).annotateHtml(html)).toContain('data-fa-title="کتابهای قدیمی, جلد 2"');
    expect(faPagefindIndex({ title: "fold" }).annotateHtml("<body><p>بی‌عنوان</p></body>")).not.toContain("data-fa-title");
    const own = `<body><h1 data-pagefind-meta="title">كتاب</h1></body>`;
    expect(faPagefindIndex({ title: "fold" }).annotateHtml(own)).not.toContain("data-fa-title");
    const data = fa.processResult({ content: "", excerpt: "", meta: { title: "کتاب قدیمی", fa_title: "كتابهاي قديمي" } });
    expect(data.meta!.title).toBe("كتابهاي قديمي");
    expect(data.meta).not.toHaveProperty("fa_title"); // Pagefind UI would list it under the result
  });

  it("annotateHtml: data-pagefind-body regions, ignored and skipped elements", () => {
    const html = `<body><nav>منو</nav><main data-pagefind-body><p>كتاب</p><div data-pagefind-ignore>نادیده</div><script>var x = "<p>اسکریپت</p>"</script></main><footer>پا</footer></body>`;
    const out = ix.annotateHtml(html);
    expect(out).toMatch(/<\/script><div hidden data-fa-search>⁅کتاب⁆<\/div><\/main>/);
  });

  it("query mode joins the terms once each", () => {
    expect(fa.processQuery("كتاب هاي من، کتاب")).toBe("کتاب من");
  });
});
