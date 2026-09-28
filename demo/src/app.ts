/**
 * The demo page: one search field driving two Pagefind UIs over the same pages
 * (stock, and with fa-search-kit and its query rescue), and a replay of the
 * benchmark's queries. Bundled by demo/build.ts into demo/dist/app.js.
 */
import { faPagefind } from "../../src/adapters/pagefind.ts";
import { pagefindKnows, rescuePagefindUI, type PagefindNotice } from "../../src/adapters/pagefind-rescue.ts";
import { adapterAnalyzer } from "../../src/adapters/shared.ts";
import { lexicon } from "../../src/lexicon/index.ts";
import { createRescue, fetchWords } from "../../src/rescue/index.ts";

interface PagefindUIInstance { triggerSearch(term: string): void }
declare const PagefindUI: new (options: Record<string, unknown>) => PagefindUIInstance;
interface PagefindModule {
  options(o: object): Promise<void>;
  init(): Promise<void>;
  search(q: string): Promise<{ results: { id: string; data(): Promise<{ url: string }> }[] }>;
}

// Same options as the build (demo/build.ts): full profile, one analyzer for both.
const analyzer = adapterAnalyzer({ profile: "full", lexicon }, "lemma");
const fa = faPagefind({ analyzer });

// Absolute: Pagefind UI resolves a relative bundlePath against its own script's folder.
const bundle = (dir: string) => new URL(`./${dir}/`, location.href).href;
// Pages are indexed as "/wiki/…" (demo/build.ts); result links start from wherever the
// site is served ("/" locally, "/fa-search-kit/" on GitHub Pages).
const baseUrl = new URL("./", location.href).pathname;
const common = { showImages: false, showSubResults: false, resetStyles: false, excerptLength: 26, pageSize: 5, baseUrl };
const stockUI = new PagefindUI({ ...common, element: "#stock", bundlePath: bundle("pagefind-stock") });

// Query rescue: the notice under the fa-search-kit box, with the word bytes the search downloaded.
const noticeBox = document.querySelector<HTMLElement>("#fa-notice")!;
const fmtKB = (bytes: number) => (bytes / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 });
let typed = "", bytesBefore = 0;
function onNotice(n: PagefindNotice | undefined) {
  noticeBox.hidden = !n;
  if (!n) return;
  noticeBox.textContent = "";
  // <bdi>: a query typed in Latin letters must not reorder the Persian sentence around it.
  const bdi = (text: string) => { const b = document.createElement("bdi"); b.textContent = text; return b; };
  const link = document.createElement("button");
  link.type = "button";
  link.className = "as-typed";
  if (n.fixed) {
    // Keyboard fixes, or nothing found as typed: these results are for the fix.
    const shown = document.createElement("span");
    shown.append("نتیجه‌ها برای «", bdi(n.to), "»");
    link.append("جست‌وجوی «", bdi(n.from), "» به همان صورت");
    link.addEventListener("click", () => n.other());
    noticeBox.append(shown, " · ", link);
  } else {
    // A misspelling: the results stay as typed, the fix is offered.
    link.append("«", bdi(n.to), "»");
    link.addEventListener("click", () => show(n.to));
    noticeBox.append("منظورتان ", link, " بود؟");
  }
  // What the fix downloaded: word-list pieces, only for spelling fixes (none for keyboard fixes or when cached).
  const kb = rescue.words.bytes - bytesBefore;
  if (kb) {
    const cost = document.createElement("small");
    cost.textContent = `برای این پیشنهاد ${fmtKB(kb)} کیلوبایت از فهرست واژه‌های سایت دریافت شد.`;
    noticeBox.append(cost);
  }
}
const rescue = rescuePagefindUI({ fa, analyzer, bundlePath: bundle("pagefind-fa"), onNotice });
const faUI = new PagefindUI({
  ...common, element: "#fa", bundlePath: bundle("pagefind-fa"), processResult: fa.processResult,
  processTerm(term: string) {
    hooks.calls++;
    // Bytes are counted from the moment this text was first searched.
    if (term.trim() !== typed) { typed = term.trim(); bytesBefore = rescue.words.bytes; }
    return rescue.processTerm(term);
  },
});
rescue.attach(faUI);
// For demo/browser-check.ts.
const hooks = { faUI, calls: 0 };
(globalThis as { faDemo?: typeof hooks }).faDemo = hooks;

// One field for both: each UI keeps its own (hidden) input and is driven with triggerSearch.
const input = document.querySelector<HTMLInputElement>("#q")!;
const search = (q: string) => {
  document.body.classList.toggle("searching", q.trim() !== "");
  stockUI.triggerSearch(q);
  faUI.triggerSearch(q);
};
input.addEventListener("input", () => search(input.value));
const show = (q: string) => {
  input.value = q;
  search(q);
  input.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
};
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-q]")) b.addEventListener("click", () => show(b.dataset.q!));
const initial = new URLSearchParams(location.search).get("q");
if (initial) { input.value = initial; search(initial); }

// Replay: the benchmark's variant queries whose targets are in the demo.
const TYPES: Record<string, string> = {
  canonical: "همان واژه‌های عنوان",
  "arabic-yk": "ی و ک عربی",
  "std-typing": "صفحه با ی و ک عربی نوشته شده",
  "zwnj-space": "فاصله به‌جای نیم‌فاصله",
  "zwnj-join": "بدون نیم‌فاصله",
  "zwnj-add": "نیم‌فاصله‌ای که صفحه ندارد",
  "alef-madda": "آ بدون کلاه",
  hamza: "همزه به شکلی دیگر",
  "heh-yeh": "ـهٔ به شکلی دیگر",
  digits: "عدد فارسی یا انگلیسی",
  "plural-add": "جمع به‌جای مفرد",
  "plural-drop": "مفرد به‌جای جمع",
  "clitic-add": "با ضمیر چسبیده (کتابم)",
  combo: "دو تفاوت با هم",
  homophone: "حرف هم‌صدا (ت و ط، س و ص…)",
  "typo-adjacent": "کلید کناری",
  "typo-delete": "یک حرف جاافتاده",
  "typo-transpose": "دو حرف جابه‌جا",
  "layout-isiri9147": "صفحه‌کلید روی انگلیسی (چینش استاندارد)",
  "layout-win-legacy": "صفحه‌کلید روی انگلیسی (چینش قدیمی ویندوز)",
  "layout-mac-legacy": "صفحه‌کلید روی انگلیسی (چینش قدیمی مک)",
  "layout-latin-on-fa": "نام لاتین با صفحه‌کلید فارسی",
};
const PER_TYPE = 40;
const fmt = (n: number) => n.toLocaleString("fa-IR");

async function load(path: string): Promise<PagefindModule> {
  const m = (await import(/* @vite-ignore */ new URL(path, location.href).href)) as PagefindModule;
  await m.options({ baseUrl });
  await m.init();
  return m;
}
async function topUrls(pf: PagefindModule, q: string, cache: Map<string, string>): Promise<string[]> {
  const res = await pf.search(q);
  return Promise.all(res.results.slice(0, 10).map(async (r) => {
    let url = cache.get(r.id);
    if (!url) { url = (await r.data()).url; cache.set(r.id, url); }
    return url;
  }));
}
const path = (u: string) => new URL(u, location.href).pathname.replace(/index\.html$/, "");
const bar = (share: number) => `<span class="bar"><span style="inline-size:${Math.round(100 * share)}%"></span></span><span class="n">${fmt(Math.round(100 * share))}٪</span>`;

document.querySelector("#run-replay")!.addEventListener("click", async (e) => {
  const button = e.currentTarget as HTMLButtonElement;
  const status = document.querySelector("#replay-status")!;
  button.disabled = true;
  status.textContent = "در حال آماده‌سازی…";
  try {
    await replay(status);
    status.textContent = "آزمون تمام شد.";
  } catch (err) {
    // Most often a page opened before the site was rebuilt (the index files were renamed).
    console.error(err);
    status.textContent = `آزمون اجرا نشد (${err instanceof Error ? err.message : err}). صفحه را دوباره بارگذاری کنید و دوباره امتحان کنید.`;
  } finally {
    button.disabled = false;
  }
});

async function replay(status: Element) {
  const all = (await (await fetch("./replay.json", { cache: "no-cache" })).json()) as { type: string; text: string; url: string }[];
  const [stock, faIndex] = await Promise.all([load("./pagefind-stock/pagefind.js"), load("./pagefind-fa/pagefind.js")]);
  const cacheS = new Map<string, string>(), cacheF = new Map<string, string>();
  // The fa side searches as the box does: with query rescue on the JS API.
  const replayRescue = createRescue({
    analyzer, words: fetchWords(new URL("./fa-words/", location.href)),
    isKnown: pagefindKnows(faIndex as never, fa),
  });
  const table = document.querySelector<HTMLTableElement>("#replay-table")!;
  const tbody = table.tBodies[0]!;
  table.hidden = false;
  tbody.textContent = "";
  for (const [type, label] of Object.entries(TYPES)) {
    // Every run replays the same queries: an even spread of each type.
    const pool = all.filter((q) => q.type === type);
    const step = Math.max(1, Math.ceil(pool.length / PER_TYPE));
    const qs = pool.filter((_, i) => i % step === 0);
    if (!qs.length) continue;
    let s = 0, f = 0, c = 0;
    let example = "";
    for (const [i, q] of qs.entries()) {
      status.textContent = `${label}: ${fmt(i + 1)} از ${fmt(qs.length)}`;
      const target = path(q.url);
      const inS = (await topUrls(stock, q.text, cacheS)).some((u) => path(u) === target);
      const faTop = (t: string) => topUrls(faIndex, fa.processQuery(t), cacheF);
      const { results, fix } = await replayRescue.rescueSearch(faTop, q.text);
      const inF = results.some((u) => path(u) === target);
      // One click: found as shown, or in the results of the suggestion ("did you mean").
      const inC = inF || (!!fix && !fix.auto && (await faTop(fix.to)).some((u) => path(u) === target));
      if (inS) s++;
      if (inF) f++;
      if (inC) c++;
      if (inF && !inS && !example) example = q.text;
    }
    const tr = tbody.insertRow();
    tr.innerHTML = `<th scope="row">${label}</th><td class="n">${fmt(qs.length)}</td><td class="stock">${bar(s / qs.length)}</td><td class="fa">${bar(f / qs.length)}</td><td class="fa">${bar(c / qs.length)}</td><td></td>`;
    if (example) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = example;
      b.addEventListener("click", () => show(example));
      tr.lastElementChild!.append(b);
    }
  }
}
