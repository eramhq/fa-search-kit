/**
 * The site's own words, for the speller: which words it uses, how often, and in
 * which spelling. Only proposes and ranks fixes; whether a word is on the site is
 * the search index's call (fa-search-kit/rescue).
 *
 * A word's key is its normalized form with ZWNJ removed and آ → ا, because the
 * index holds the joined and madda-less spellings too (src/analyzer.ts). The
 * site's most common spelling of each key is kept, for the "showing results
 * for" notice.
 *
 * The list is split into pieces by the first letter's sound-alike class (so a
 * first-letter swap «سابون» → «صابون» stays in one piece) and by length, so a
 * search downloads only the pieces its unknown words need.
 */
import { ZWNJ } from "../normalize.ts";
import { LETTERS } from "./keyboard.ts";

/** A word's spelling on the site and how often it occurs (rounded to a power of two in a built list). */
export type Word = [spelling: string, count: number];
/** Words by key. */
export type Piece = Map<string, Word>;

/** Where the speller gets pieces: a `WordList` (in memory) or `fetchWords` (built list, downloaded when needed). */
export interface WordSource {
  piece(key: string): Piece | undefined | Promise<Piece | undefined>;
}

/** Persian letters only (normalized text: ی and ک, no marks, no ZWNJ). */
export const persian = (key: string) => key.match(LETTERS)?.length === key.length;
/** First letters that share a piece: sound-alike letters, and ا/ع (alike only at the start of a word). */
const CLASSES = ["اع", "تط", "ثسص", "حه", "ذزضظ", "غق"];
/** Longer words share the last length bucket. */
const MAX_LEN = 15;

export const wordKey = (word: string) => word.replaceAll(ZWNJ, "").replaceAll("آ", "ا");

/** The piece a key of `length` letters starting with `first` is in: ASCII, for file names. */
export function pieceKey(first: string, length: number): string {
  const c = CLASSES.findIndex((g) => g.includes(first));
  return `${c < 0 ? first.charCodeAt(0) : c}.${Math.min(length, MAX_LEN)}`;
}

/** The pieces that may hold a word within `edits` letters of `key` (same first-letter class). */
export const piecesFor = (key: string, edits: number): string[] => {
  const out = new Set<string>();
  for (let n = Math.max(3, key.length - edits); n <= key.length + edits; n++) out.add(pieceKey(key[0]!, n));
  return [...out];
};

/** Words collected from text in memory (the browser, or a build step). */
export class WordList implements WordSource {
  readonly pieces = new Map<string, Piece>();
  /** How often each spelling occurs, to keep each key's most common one. */
  private spellings = new Map<string, number>();

  /** Add one normalized token (as `analyzer.tokens()` gives it); words of 3+ Persian letters are kept. */
  add(token: string): void {
    const key = wordKey(token);
    if (key.length < 3 || !persian(key)) return;
    const n = (this.spellings.get(token) ?? 0) + 1;
    this.spellings.set(token, n);
    const pk = pieceKey(key[0]!, key.length);
    let piece = this.pieces.get(pk);
    if (!piece) this.pieces.set(pk, (piece = new Map()));
    const word = piece.get(key);
    if (!word) piece.set(key, [token, 1]);
    else {
      word[1]++;
      if (word[0] !== token && n > this.spellings.get(word[0])!) word[0] = token;
    }
  }

  piece(key: string): Piece | undefined {
    return this.pieces.get(key);
  }
}

/**
 * A piece as text: one word per line, sorted, each line the length of the prefix it
 * shares with the previous word (one digit), the rest of the word, and its count as
 * ⌊log₂ count⌋ (one digit).
 */
export function decodePiece(text: string): Piece {
  const piece: Piece = new Map();
  let prev = "";
  for (const line of text.split("\n")) {
    if (!line) continue;
    prev = prev.slice(0, +line[0]!) + line.slice(1, -1);
    piece.set(wordKey(prev), [prev, 2 ** +line.at(-1)!]);
  }
  return piece;
}

/**
 * The manifest of a built list (`<dir>/index.json`): its content hash and the keys of
 * its pieces, each at `<dir>/<key>.<hash>.bin` (gzipped text), so a rebuilt site
 * never serves a stale piece.
 */
export interface Manifest { v: 1; hash: string; keys: string[] }

export interface FetchedWords extends WordSource {
  /** Bytes downloaded so far (manifest and pieces, as sent). */
  readonly bytes: number;
}

/**
 * A built word list, fetched piece by piece when the speller needs one (never on page
 * load). `dir`: the URL of the folder the build wrote (fa-search-kit/rescue/build).
 */
export function fetchWords(dir: string | URL, fetcher: typeof fetch = (...a) => fetch(...a)): FetchedWords {
  const base = folder(dir);
  const cache = new Map<string, Promise<Piece | undefined>>();
  let manifest: Promise<Manifest> | undefined, bytes = 0;
  const get = async (file: string) => {
    const res = await fetcher(base + file);
    if (!res.ok) throw new Error(`${res.status} ${base + file}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    bytes += buf.length;
    // Gzipped unless a server already decoded it.
    return new Response(buf[0] === 0x1f && buf[1] === 0x8b ? new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip")) : buf).text();
  };
  const piece = async (key: string) => {
    const m: Manifest = await (manifest ??= get("index.json").then(JSON.parse));
    return m.keys.includes(key) ? decodePiece(await get(`${key}.${m.hash}.bin`)) : undefined;
  };
  return {
    get bytes() { return bytes; },
    piece(key) {
      let p = cache.get(key);
      if (!p) {
        cache.set(key, (p = piece(key)));
        // A failed download is retried next time.
        p.catch(() => { cache.delete(key); manifest = undefined; });
      }
      return p;
    },
  };
}

/** An absolute folder URL, ending in «/». */
export const folder = (dir: string | URL) => new URL(dir, globalThis.location?.href).href.replace(/\/?$/, "/");
