/**
 * fa-search-kit/pagefind/build: the index side of Persian for Pagefind (build time).
 *
 * Each page keeps its own text (results and excerpts stay readable) and gains a
 * hidden block with the analyzer's index terms, which Pagefind indexes like any
 * other text. Terms of a heading keep the heading's weight. Either run the CLI
 * over the built site before Pagefind,
 *
 *     npx fa-search-kit-pagefind dist && npx pagefind --site dist
 *
 * or use Pagefind's Node API:
 *
 *     const fa = faPagefindIndex();
 *     await fa.addPages(index, [{ url: "/a/", content: html }]);
 *
 * Query with `faPagefind` from fa-search-kit/pagefind and the same options. Pages
 * must be in a language Pagefind does not stem (`<html lang="fa">`); Pagefind has
 * no Persian stemmer, and an Arabic one would stem the terms again.
 */
import { normalize } from "../normalize.ts";
import { CLOSE, OPEN } from "./pagefind.ts";
import { adapterAnalyzer, type AdapterOptions } from "./shared.ts";

export interface PagefindIndexOptions extends AdapterOptions {
  /**
   * Which index terms go into the hidden block: "all" (default); only those that are not
   * already a word of the page as Pagefind indexes it ("new"); or only those that do not
   * begin any word of the page or of the block ("prefix": Pagefind matches query terms as
   * prefixes, so such a term adds only page length). Every extra word lowers the page's
   * score a little (page length); "new" and "prefix" trade that against ranking and
   * lost on the benchmark (bench/results/experiments.md, P1).
   */
  terms?: "all" | "new" | "prefix";
  /** `data-pagefind-weight` of the block holding body text terms (heading terms keep their heading's weight). */
  weight?: number;
  /**
   * Pagefind also ranks matches in the page's title meta (its first <h1>), so a title
   * spelled with Arabic ي/ك gets none of that boost. "fold": the title meta becomes the
   * normalized title; "terms" (default): the title's index terms; "keep": untouched. With
   * "fold"/"terms" the real title is kept as meta `fa_title`, and `processResult`
   * (fa-search-kit/pagefind) shows it. A page that sets its own title meta is left alone.
   */
  title?: "keep" | "fold" | "terms";
  /**
   * Also add the normalized spelling of every word Pagefind reads differently (Arabic
   * ي/ك, diacritics, hamza forms), so Pagefind's prefix matching treats the page like
   * one typed in standard Persian. Default true.
   */
  surface?: boolean;
}

/** What `addPages` needs from a Pagefind Node API index. */
export interface PagefindIndex {
  addHTMLFile(file: { url?: string; sourcePath?: string; content: string }): Promise<{ errors: string[] }>;
}

export interface PagefindIndexAdapter {
  /** The page with the analyzer's index terms added in hidden blocks. Idempotent. */
  annotateHtml(html: string): string;
  /** `index.addHTMLFile` for each page, annotated first. Returns Pagefind's errors. */
  addPages(index: PagefindIndex, pages: Iterable<{ url?: string; sourcePath?: string; content: string }>): Promise<string[]>;
}

/** Elements Pagefind leaves out of the index (fossick/parser.rs, 1.5). */
const SKIP = new Set(["head", "style", "script", "noscript", "label", "form", "svg", "footer", "nav", "iframe", "template", "title", "textarea"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "em", "i", "kbd", "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "var"]);
/** Pagefind's default heading weights. */
const HEADING: Record<string, number> = { h1: 7, h2: 6, h3: 5, h4: 4, h5: 3, h6: 2 };
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "‌", zwj: "‍", lrm: "", rlm: "", shy: "" };
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const BLOCK = /<(div|span) hidden data-fa-search[^>]*>[^<]*<\/\1>/g;
const OWN_TITLE = /data-pagefind-meta\s*=\s*["'][^"']*\btitle\b/i;
const escapeAttr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const decode = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m);
const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+))?`, "i").exec(attrs);
/** A word as Pagefind indexes it: lowercased, marks stripped after NFD. */
const pagefindWord = (w: string) => w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

interface Region { end: number; text: Map<number, string[]> }

export function faPagefindIndex(options: PagefindIndexOptions = {}): PagefindIndexAdapter {
  const analyzer = adapterAnalyzer(options, "lemma"); // as faPagefind: every query word must match (H10)
  // Defaults: the P1 experiments' winner (bench/results/experiments.md, "pf-all-surface").
  const termsMode = options.terms ?? "all";
  const titleMode = options.title ?? "terms";
  const surface = options.surface ?? true;

  /** Hidden blocks for one region's text, by weight. */
  function blocks(text: Map<number, string[]>): string {
    let out = "";
    for (const [weight, chunks] of text) {
      const plain = chunks.join(" ");
      // Words as Pagefind indexes them. It indexes a half-space word joined
      // («تی‌شرت» → «تیشرت»), not its parts (probed on 1.5.2).
      const words = plain.split(/[^\p{L}\p{N}\p{M}\u200C]+/u).filter(Boolean);
      // Repeats are kept: a term counts as often as its word occurs, as in the page.
      // The markers are glued to the terms: a marker on its own counts as a word, and
      // every extra word lowers Pagefind's score a little (page length).
      let terms = analyzer.analyze(plain, { mode: "index" });
      const own = words.map((w) => pagefindWord(w.replaceAll("\u200C", "")));
      if (surface) {
        // The normalized spelling of each word Pagefind reads differently («حسينيان» →
        // «حسینیان»), so its prefix matches reach this page as they reach one typed in Persian.
        const have = new Set(terms.map(pagefindWord));
        words.forEach((w, i) => {
          const n = normalize(w).text.replaceAll("\u200C", "");
          if (n && pagefindWord(n) !== own[i] && !have.has(pagefindWord(n))) terms.push(n);
        });
      }
      if (termsMode === "new") {
        const seen = new Set(own);
        terms = terms.filter((t) => !seen.has(pagefindWord(t)));
      } else if (termsMode === "prefix") {
        const longer = [...own, ...terms.map(pagefindWord)];
        terms = terms.filter((t) => { const k = pagefindWord(t); return !longer.some((x) => x !== k && x.startsWith(k)) && !own.includes(k); });
      }
      const w = weight === 1 && options.weight ? options.weight : weight;
      if (terms.length) out += `<div hidden data-fa-search${w === 1 ? "" : ` data-pagefind-weight="${w}"`}>${OPEN}${terms.join(" ")}${CLOSE}</div>`;
    }
    return out;
  }

  function annotateHtml(input: string): string {
    const html = input.replace(BLOCK, "");
    const explicitBody = /\sdata-pagefind-body[\s=>]/i.test(html);
    const regions: Region[] = [];
    // Open elements: tag name, whether its text is skipped, its weight, and its region.
    const stack: { tag: string; skip: boolean; weight: number; region?: Region }[] = [];
    let current: Region | undefined;
    let last = 0;
    // The page title as Pagefind takes it: the first <h1>, else <title>.
    let h1: string | undefined, h1Depth = -1, titleTag: string | undefined;
    const text = (s: string, glue: boolean) => {
      const top = stack.at(-1);
      if (h1Depth >= 0 && !top?.skip) h1 += s;
      if (!current || top?.skip) return;
      const weight = top?.weight ?? 1;
      const chunks = current.text.get(weight) ?? [];
      if (!current.text.has(weight)) current.text.set(weight, chunks);
      if (glue && chunks.length) chunks[chunks.length - 1] += s;
      else chunks.push(s);
    };
    const re = new RegExp(TAG);
    for (let m = re.exec(html); m; m = re.exec(html)) {
      const [whole, close, name, attrs = ""] = m;
      text(decode(html.slice(last, m.index)), true);
      last = m.index + whole.length;
      if (!name) continue;
      const tag = name.toLowerCase();
      if (close) {
        let at = stack.length - 1;
        while (at >= 0 && stack[at]!.tag !== tag) at--;
        if (at < 0) continue;
        // Regions never nest (a new one opens only outside any other).
        const popped = stack.splice(at);
        for (const e of popped) if (e.region) { e.region.end = m.index; current = undefined; }
        if (h1Depth >= 0 && stack.length <= h1Depth) h1Depth = -1;
        // A skipped element is a word boundary even when inline: «گفتم<b data-pagefind-ignore>—</b>نیامد».
        if (!INLINE.has(tag) || popped[0]!.skip) text(" ", false);
        continue;
      }
      const top = stack.at(-1);
      const ignored = attr(attrs, "data-pagefind-ignore") !== null;
      if (!INLINE.has(tag) || ignored || SKIP.has(tag)) text(" ", false);
      if (VOID.has(tag) || whole.endsWith("/>")) continue;
      const weightAttr = attr(attrs, "data-pagefind-weight")?.[1]?.replace(/["']/g, "");
      const entry: (typeof stack)[number] = {
        tag,
        // data-pagefind-ignore, with any value, leaves the element out of the index.
        skip: (top?.skip ?? false) || SKIP.has(tag) || ignored,
        weight: weightAttr ? Number(weightAttr) : HEADING[tag] ?? top?.weight ?? 1,
      };
      if (!current && (explicitBody ? attr(attrs, "data-pagefind-body") : tag === "body")) {
        entry.region = current = { end: -1, text: new Map() };
        regions.push(current);
      }
      if (tag === "h1" && h1 === undefined && !entry.skip) { h1 = ""; h1Depth = stack.length; }
      stack.push(entry);
      if (RAW.has(tag)) {
        const endTag = new RegExp(`</${tag}`, "ig");
        endTag.lastIndex = last;
        re.lastIndex = endTag.exec(html)?.index ?? html.length;
        if (tag === "title") titleTag ??= decode(html.slice(last, re.lastIndex));
        last = re.lastIndex;
      }
    }
    text(decode(html.slice(last)), true);
    for (const r of regions) if (r.end < 0) r.end = html.length; // never closed
    // A fragment without <body> is one region.
    if (!regions.length && !explicitBody) regions.push({ end: html.length, text: new Map([[1, [decode(html.replace(TAG, " "))]]]) });
    const title = (h1 ?? titleTag ?? "").replace(/\s+/g, " ").trim();
    let meta = "";
    if (titleMode !== "keep" && title && !OWN_TITLE.test(html)) {
      const ranked = titleMode === "terms" ? analyzer.analyze(title, { mode: "index" }).join(" ") : normalize(title).text;
      // Attribute-sourced values: commas in the title are safe and nothing reaches the indexed text.
      meta = `<span hidden data-fa-search data-pagefind-meta="title[data-fa-title], fa_title[data-fa-original]" data-fa-title="${escapeAttr(ranked)}" data-fa-original="${escapeAttr(title)}"></span>`;
    }
    const first = regions[0];
    let out = html;
    for (const r of [...regions].sort((a, b) => b.end - a.end)) {
      out = out.slice(0, r.end) + blocks(r.text) + (r === first ? meta : "") + out.slice(r.end);
    }
    return out;
  }

  return {
    annotateHtml,
    async addPages(index, pages) {
      const errors: string[] = [];
      for (const page of pages) errors.push(...(await index.addHTMLFile({ ...page, content: annotateHtml(page.content) })).errors);
      return errors;
    },
  };
}
