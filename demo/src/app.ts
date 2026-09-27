/**
 * The demo page: two Pagefind UIs over the same pages (stock, and with
 * fa-search-kit), kept in sync, and a replay of the benchmark's queries.
 * Bundled by demo/build.ts into demo/dist/app.js.
 */
import { faPagefind } from "../../src/adapters/pagefind.ts";
import { lexicon } from "../../src/lexicon/index.ts";

interface PagefindUIInstance { triggerSearch(term: string): void }
declare const PagefindUI: new (options: Record<string, unknown>) => PagefindUIInstance;
interface PagefindModule {
  init(): Promise<void>;
  search(q: string): Promise<{ results: { id: string; data(): Promise<{ url: string }> }[] }>;
}

// Same options as the build (demo/build.ts): full profile.
const fa = faPagefind({ profile: "full", lexicon });

const common = { showImages: false, showSubResults: false, resetStyles: false, excerptLength: 30 };
const stockUI = new PagefindUI({ ...common, element: "#stock", bundlePath: "./pagefind-stock/" });
const faUI = new PagefindUI({ ...common, element: "#fa", bundlePath: "./pagefind-fa/", processTerm: fa.processTerm, processResult: fa.processResult });

// Typing in one box searches in both.
const input = (id: string) => document.querySelector<HTMLInputElement>(`#${id} input`);
const sync = (from: string, to: PagefindUIInstance) =>
  input(from)?.addEventListener("input", (e) => to.triggerSearch((e.target as HTMLInputElement).value));
const searchBoth = (q: string) => { stockUI.triggerSearch(q); faUI.triggerSearch(q); };
requestAnimationFrame(() => { sync("stock", faUI); sync("fa", stockUI); });
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-q]")) b.addEventListener("click", () => searchBoth(b.dataset.q!));

// Replay: the benchmark's variant queries whose targets are in the demo.
const TYPE_NAMES: Record<string, string> = {
  canonical: "بی‌تغییر (کنترل)", "std-typing": "صفحه با ي/ك عربی یا اعراب", "arabic-yk": "ي/ك عربی در پرس‌وجو",
  "alef-madda": "آ بی‌کلاه", hamza: "همزه", "heh-yeh": "ـهٔ / ـه‌ی", diacritics: "بی‌اعراب", digits: "رقم لاتین/فارسی",
  "zwnj-space": "فاصله به‌جای نیم‌فاصله", "zwnj-join": "بی‌نیم‌فاصله", "zwnj-add": "نیم‌فاصلهٔ اضافه",
  "plural-add": "جمع", "plural-drop": "مفرد", "clitic-add": "ضمیر متصل", combo: "دو تغییر با هم",
};
const PER_TYPE = 40;

async function load(path: string): Promise<PagefindModule> {
  const m = (await import(/* @vite-ignore */ new URL(path, location.href).href)) as PagefindModule;
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
const same = (a: string, b: string) => a.replace(/index\.html$/, "").replace(/^\.?\//, "/") === b.replace(/^\.?\//, "/");

document.querySelector("#run-replay")!.addEventListener("click", async (e) => {
  const button = e.target as HTMLButtonElement;
  button.disabled = true;
  const status = document.querySelector("#replay-status")!;
  const all = (await (await fetch("./replay.json")).json()) as { type: string; text: string; url: string }[];
  const [stock, faIndex] = await Promise.all([load("./pagefind-stock/pagefind.js"), load("./pagefind-fa/pagefind.js")]);
  const cacheS = new Map<string, string>(), cacheF = new Map<string, string>();
  const tbody = document.querySelector("#replay-table tbody")!;
  (document.querySelector("#replay-table") as HTMLElement).hidden = false;
  tbody.textContent = "";
  for (const type of Object.keys(TYPE_NAMES)) {
    // Seeded pick: every run replays the same queries.
    const qs = all.filter((q) => q.type === type).filter((_, i, a) => a.length <= PER_TYPE || i % Math.ceil(a.length / PER_TYPE) === 0);
    if (!qs.length) continue;
    let s = 0, f = 0;
    const wins: string[] = [];
    for (const [i, q] of qs.entries()) {
      status.textContent = `${TYPE_NAMES[type]}: ${i + 1}/${qs.length}`;
      const inS = (await topUrls(stock, q.text, cacheS)).some((u) => same(u, q.url));
      const inF = (await topUrls(faIndex, fa.processQuery(q.text), cacheF)).some((u) => same(u, q.url));
      if (inS) s++;
      if (inF) f++;
      if (inF && !inS && wins.length < 3) wins.push(q.text);
    }
    const tr = document.createElement("tr");
    const pct = (x: number) => `${Math.round((100 * x) / qs.length)}٪`;
    tr.innerHTML = `<td>${TYPE_NAMES[type]}</td><td>${qs.length}</td><td class="n">${pct(s)}</td><td class="n">${pct(f)}</td><td></td>`;
    for (const w of wins) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = w;
      b.addEventListener("click", () => { searchBoth(w); window.scrollTo({ top: 0, behavior: "smooth" }); });
      tr.lastElementChild!.append(b);
    }
    tbody.append(tr);
  }
  status.textContent = "تمام.";
  button.disabled = false;
});
