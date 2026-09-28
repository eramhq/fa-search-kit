/**
 * The demo in a real browser: serves demo/dist, opens it in headless Chrome
 * (DevTools protocol, no dependencies), clicks every example search, and fails on
 * a console error, a failed request, an example that finds nothing with
 * fa-search-kit, or a leaked meta tag under a result. Then query rescue in Pagefind
 * UI: `triggerSearch` with the same text does nothing (so the rescue's trailing-space
 * rerun is needed), a wrong-keyboard search reruns with the fix and shows the notice,
 * "as typed" searches the text as typed, a rerun keeps a selected filter, and the
 * rescue shares the UI's pagefind.js (one instance: its files are fetched once).
 * Screenshots go to demo/dist/screenshots/.
 *
 *     node demo/build.ts && node demo/browser-check.ts
 *
 * Chrome: $CHROME, else the default macOS install path.
 * (demo/check.ts replays the benchmark through pagefind.js directly and cannot see
 * Pagefind UI problems, such as how it resolves `bundlePath`.)
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const DIST = new URL("dist/", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const server = createServer((req, res) => {
  let path = join(DIST, decodeURIComponent(new URL(req.url!, "http://x").pathname));
  try { if (statSync(path).isDirectory()) path = join(path, "index.html"); res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

const port = 9400 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "fa-demo-"))}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let targets: { type: string; webSocketDebuggerUrl: string }[] | undefined;
for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
if (!targets) throw new Error(`could not start Chrome at ${CHROME} (set $CHROME)`);
const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let seq = 0;
const pending = new Map<number, (m: { result?: { result?: { value?: unknown }; data?: string } }) => void>();
const problems: string[] = [];
const requested: string[] = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(String(e.data));
  pending.get(m.id)?.(m);
  if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(`console.error: ${m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description).join(" ")}`);
  if (m.method === "Network.requestWillBeSent") requested.push(m.params.request.url);
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400 && !/favicon|fonts\.g/.test(m.params.response.url)) problems.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`);
});
const send = (method: string, params: object = {}) => new Promise<{ result?: { result?: { value?: unknown }; data?: string } }>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async <T>(body: string) => (await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value as T;
const shot = async (name: string) => { mkdirSync(join(DIST, "screenshots"), { recursive: true }); writeFileSync(join(DIST, "screenshots", name), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result!.data!, "base64")); };

for (const method of ["Runtime.enable", "Page.enable", "Network.enable"]) await send(method);
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin });
await sleep(2500);
const atLoad = requested.length;

const examples = await evaluate<string[]>(`return [...document.querySelectorAll("button[data-q]")].map((b) => b.dataset.q);`);
let failed = 0;
for (const [i, q] of examples.entries()) {
  const r = await evaluate<{ fa: string; stock: string; results: number; tags: number }>(`
    document.querySelector('button[data-q="${q}"]').click();
    for (let i = 0; i < 40 && !document.querySelector("#fa .pagefind-ui__message")?.textContent.includes(${JSON.stringify(q)}); i++) await new Promise((r) => setTimeout(r, 150));
    await new Promise((r) => setTimeout(r, 400));
    return {
      fa: document.querySelector("#fa .pagefind-ui__message")?.textContent ?? "",
      stock: document.querySelector("#stock .pagefind-ui__message")?.textContent ?? "",
      results: document.querySelectorAll("#fa .pagefind-ui__result").length,
      tags: document.querySelectorAll(".pagefind-ui__result-tags li").length,
    };`);
  const ok = r.results > 0 && r.tags === 0;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} «${q}»  stock: ${r.stock} | fa-search-kit: ${r.fa}${r.tags ? ` | ${r.tags} meta tags shown` : ""}`);
  if (i === 0) await shot("example.png");
}

// --- query rescue in Pagefind UI ---------------------------------------------------
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`); if (!ok) failed++; };
const helpers = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const input = document.querySelector("#q");
  const type = (q) => { input.value = q; input.dispatchEvent(new Event("input")); };
  const notice = () => document.querySelector("#fa-notice");
  const waitFor = async (f) => { for (let i = 0; i < 60 && !f(); i++) await sleep(150); return f(); };
  const results = () => [...document.querySelectorAll("#fa .pagefind-ui__result-link")].map((a) => a.getAttribute("href"));`;

const noop = await evaluate<{ same: number; space: number }>(`${helpers}
  type("کتاب");
  await waitFor(() => document.querySelector("#fa .pagefind-ui__message")?.textContent.includes("کتاب"));
  await sleep(800);
  const d = window.faDemo, before = d.calls;
  d.faUI.triggerSearch("کتاب"); await sleep(1000);
  const same = d.calls - before;
  d.faUI.triggerSearch("کتاب "); await sleep(1000);
  return { same, space: d.calls - before - same };`);
check("triggerSearch with the same text does nothing; a trailing space searches again", noop.same === 0 && noop.space > 0, JSON.stringify(noop));

const fixed = await evaluate<{ notice: string; results: number; message: string }>(`${helpers}
  type("nd[d ;hgh");
  await waitFor(() => !notice().hidden && results().length);
  return { notice: notice().hidden ? "" : notice().textContent, results: results().length, message: document.querySelector("#fa .pagefind-ui__message")?.textContent ?? "" };`);
check("a wrong-keyboard search reruns with the fix and shows the notice", fixed.results > 0 && fixed.notice.includes("دیجی"), `${fixed.notice} | ${fixed.message}`);
await shot("rescue.png");

const typed = await evaluate<{ hidden: boolean; message: string }>(`${helpers}
  document.querySelector("#fa-notice .as-typed").click();
  await waitFor(() => notice().hidden);
  await sleep(800);
  return { hidden: notice().hidden, message: document.querySelector("#fa .pagefind-ui__message")?.textContent ?? "" };`);
check("“as typed” searches the text as typed and hides the notice", typed.hidden, typed.message);

const filtered = await evaluate<{ checked: boolean; notice: string; urls: string[] }>(`${helpers}
  type("هوای فشرده"); await sleep(1500);
  const wiki = () => [...document.querySelectorAll("#fa .pagefind-ui__filter-checkbox")].find((c) => c.value === "ویکی\u200cپدیا");
  const box = await waitFor(wiki);
  if (!box) return { checked: false, notice: "", urls: [] };
  box.click(); await sleep(1000);
  type("هوای فشدره");
  await waitFor(() => !notice().hidden && results().length);
  return { checked: box.checked, notice: notice().hidden ? "" : notice().textContent, urls: results() };`);
check("the rerun keeps a selected filter", filtered.checked && filtered.urls.length > 0 && filtered.urls.every((u) => u.includes("/wiki/")) && filtered.notice.includes("فشرده"), `${filtered.notice} | ${filtered.urls.length} results`);

// The replay panel: runs to the end, with a row per variant type and no error.
const t0 = Date.now();
const replay = await evaluate<{ status: string; rows: number; seconds: number; progress: string[] }>(`${helpers}
  document.querySelector("#run-replay").click();
  const status = document.querySelector("#replay-status"), progress = [];
  for (let i = 0; i < 1200 && !status.textContent.includes("تمام"); i++) { await sleep(500); if (i % 20 === 0) progress.push(status.textContent); }
  return { status: status.textContent, rows: document.querySelectorAll("#replay-table tbody tr").length, seconds: 0, progress };`);
check("the replay runs to the end", replay.status.includes("تمام") && replay.rows >= 15, `${replay.rows} rows in ${Math.round((Date.now() - t0) / 1000)} s; ${replay.status}; progress: ${replay.progress.slice(0, 6).join(" | ")}`);
await shot("replay.png");

const once = (path: string) => requested.filter((u) => u.includes(path)).length;
// Each pagefind.js instance starts its own worker (whose own fetches this page-level log does not see).
check("the rescue shares the UI's pagefind.js (one instance)", once("pagefind-fa/pagefind.js") === 1 && once("pagefind-fa/pagefind-worker.js") === 1,
  `pagefind.js ${once("pagefind-fa/pagefind.js")}×, pagefind-worker.js ${once("pagefind-fa/pagefind-worker.js")}×`);
check("word pieces are never downloaded on page load, only by weak searches", !requested.slice(0, atLoad).some((u) => u.includes("/fa-words/")) && requested.some((u) => u.includes("/fa-words/")));

await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await shot("example-dark.png");

ws.close();
chrome.kill();
server.close();
for (const p of problems) console.log(`FAIL ${p}`);
console.log(`${examples.length} examples, 6 rescue checks and the replay, ${failed + problems.length} problem(s); screenshots in demo/dist/screenshots/`);
process.exit(failed + problems.length ? 1 : 0);
