/**
 * The demo in a real browser: serves demo/dist, opens it in headless Chrome
 * (DevTools protocol, no dependencies), clicks every example search, and fails on
 * a console error, a failed request, an example that finds nothing with
 * fa-search-kit, or a leaked meta tag under a result. Screenshots go to
 * demo/dist/screenshots/.
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
ws.addEventListener("message", (e) => {
  const m = JSON.parse(String(e.data));
  pending.get(m.id)?.(m);
  if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(`console.error: ${m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description).join(" ")}`);
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400 && !/favicon|fonts\.g/.test(m.params.response.url)) problems.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`);
});
const send = (method: string, params: object = {}) => new Promise<{ result?: { result?: { value?: unknown }; data?: string } }>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async <T>(body: string) => (await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value as T;
const shot = async (name: string) => { mkdirSync(join(DIST, "screenshots"), { recursive: true }); writeFileSync(join(DIST, "screenshots", name), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result!.data!, "base64")); };

for (const method of ["Runtime.enable", "Page.enable", "Network.enable"]) await send(method);
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin });
await sleep(2500);

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
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await shot("example-dark.png");

ws.close();
chrome.kill();
server.close();
for (const p of problems) console.log(`FAIL ${p}`);
console.log(`${examples.length} examples, ${failed + problems.length} problem(s); screenshots in demo/dist/screenshots/`);
process.exit(failed + problems.length ? 1 : 0);
