/**
 * fa-search-kit/rescue/build: the site's word list for the speller, written as
 * small pieces next to the search index (build time, Node).
 *
 *     npx fa-search-kit-pagefind dist --words && npx pagefind --site dist
 *
 * or with the Node API:
 *
 *     const words = createWordList();
 *     await faPagefindIndex({ words }).addPages(index, pages);   // exactly the text Pagefind indexes
 *     await words.write("dist/fa-words");
 *
 * The browser downloads a piece only when a weak search needs it (`fetchWords` in
 * fa-search-kit/rescue). File names carry a hash of the list, so a rebuilt site never
 * serves a stale piece; `write` removes the previous build's pieces.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createAnalyzer, type Analyzer } from "../analyzer.ts";
import { WordList, type Manifest } from "./words.ts";

export interface WordListOptions {
  /** Tokenizes the text (default: the standard analyzer; tokens are the same in every profile). */
  analyzer?: Analyzer;
}

export interface WordListBuilder {
  /** Add text as the index sees it (fa-search-kit/pagefind/build calls this with each page's indexed text). */
  add(text: string): void;
  readonly list: WordList;
  /** The files to write: `index.json` and one gzipped piece per key, by file name. */
  files(): Map<string, Uint8Array>;
  /** Write the files into `dir` (created if needed), replacing an earlier build's. Returns their total size in bytes. */
  write(dir: string): number;
}

/** Front-coded lines: shared prefix length, the rest, ⌊log₂ count⌋ (words.ts, `decodePiece`). */
function encodePiece(words: [string, number][]): string {
  let prev = "", out = "";
  for (const [word, count] of words.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    let p = 0;
    while (p < 9 && p < word.length && word[p] === prev[p]) p++;
    out += `${p}${word.slice(p)}${Math.min(9, Math.floor(Math.log2(count)))}\n`;
    prev = word;
  }
  return out;
}

export function createWordList(options: WordListOptions = {}): WordListBuilder {
  const analyzer = options.analyzer ?? createAnalyzer();
  const list = new WordList();

  function files(): Map<string, Uint8Array> {
    const texts = new Map<string, string>();
    for (const [key, piece] of [...list.pieces].sort(([a], [b]) => (a < b ? -1 : 1))) {
      texts.set(key, encodePiece([...piece.values()].map((w) => [w[0], w[1]])));
    }
    const hash = createHash("sha256").update([...texts].map(([k, t]) => `${k}\n${t}`).join("\0")).digest("hex").slice(0, 10);
    const manifest: Manifest = { v: 1, hash, keys: [...texts.keys()] };
    const out = new Map<string, Uint8Array>([["index.json", new TextEncoder().encode(JSON.stringify(manifest))]]);
    for (const [key, text] of texts) out.set(`${key}.${hash}.bin`, gzipSync(text, { level: 9 }));
    return out;
  }

  return {
    list,
    add(text) {
      for (const t of analyzer.tokens(text)) list.add(t.text);
    },
    files,
    write(dir) {
      mkdirSync(dir, { recursive: true });
      for (const f of readdirSync(dir)) if (f === "index.json" || /^\d+\.\d+\.[\da-f]+\.bin$/.test(f)) rmSync(join(dir, f));
      let bytes = 0;
      for (const [name, data] of files()) { writeFileSync(join(dir, name), data); bytes += data.length; }
      return bytes;
    },
  };
}
