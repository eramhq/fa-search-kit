/**
 * The demo page: one search field driving two Pagefind UIs over the same pages
 * (stock, and with fa-search-kit), and a replay of the benchmark's queries.
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

// Absolute: Pagefind UI resolves a relative bundlePath against its own script's folder.
const bundle = (dir: string) => new URL(`./${dir}/`, location.href).href;
const common = { showImages: false, showSubResults: false, resetStyles: false, excerptLength: 26, pageSize: 5 };
const stockUI = new PagefindUI({ ...common, element: "#stock", bundlePath: bundle("pagefind-stock") });
const faUI = new PagefindUI({ ...common, element: "#fa", bundlePath: bundle("pagefind-fa"), processTerm: fa.processTerm, processResult: fa.processResult });

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
  canonical: "همان کلمه‌های عنوان",
  "arabic-yk": "با ي و ك عربی",
  "std-typing": "صفحه با ي و ك عربی نوشته شده",
  "zwnj-space": "فاصله به‌جای نیم‌فاصله",
  "zwnj-join": "بدون نیم‌فاصله",
  "zwnj-add": "نیم‌فاصله‌ای که صفحه ندارد",
  "alef-madda": "آ بدون کلاه",
  hamza: "همزه به شکل دیگر",
  "heh-yeh": "ـهٔ به شکل دیگر",
  digits: "عدد فارسی یا انگلیسی",
  "plural-add": "جمع به‌جای مفرد",
  "plural-drop": "مفرد به‌جای جمع",
  "clitic-add": "با ضمیر چسبیده (کتابم)",
  combo: "دو تفاوت با هم",
};
const PER_TYPE = 40;
const fmt = (n: number) => n.toLocaleString("fa-IR");

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
const path = (u: string) => new URL(u, location.href).pathname.replace(/index\.html$/, "");
const bar = (share: number) => `<span class="bar"><span style="inline-size:${Math.round(100 * share)}%"></span></span><span class="n">${fmt(Math.round(100 * share))}٪</span>`;

document.querySelector("#run-replay")!.addEventListener("click", async (e) => {
  const button = e.currentTarget as HTMLButtonElement;
  button.disabled = true;
  const status = document.querySelector("#replay-status")!;
  const all = (await (await fetch("./replay.json")).json()) as { type: string; text: string; url: string }[];
  const [stock, faIndex] = await Promise.all([load("./pagefind-stock/pagefind.js"), load("./pagefind-fa/pagefind.js")]);
  const cacheS = new Map<string, string>(), cacheF = new Map<string, string>();
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
    let s = 0, f = 0;
    let example = "";
    for (const [i, q] of qs.entries()) {
      status.textContent = `${label}: ${fmt(i + 1)} از ${fmt(qs.length)}`;
      const target = path(q.url);
      const inS = (await topUrls(stock, q.text, cacheS)).some((u) => path(u) === target);
      const inF = (await topUrls(faIndex, fa.processQuery(q.text), cacheF)).some((u) => path(u) === target);
      if (inS) s++;
      if (inF) f++;
      if (inF && !inS && !example) example = q.text;
    }
    const tr = tbody.insertRow();
    tr.innerHTML = `<th scope="row">${label}</th><td class="n">${fmt(qs.length)}</td><td class="stock">${bar(s / qs.length)}</td><td class="fa">${bar(f / qs.length)}</td><td></td>`;
    if (example) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = example;
      b.addEventListener("click", () => show(example));
      tr.lastElementChild!.append(b);
    }
  }
  status.textContent = "تمام شد.";
  button.disabled = false;
});
