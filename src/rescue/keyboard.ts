/**
 * fa-search-kit/keyboard: text typed with the keyboard on the wrong layout.
 *
 *     keyboardCandidates("nd[d")      // ["دیجی"]: meant Persian, the OS was on English
 *     keyboardCandidates("Chmk")      // ["ژاپن", …]: shifted keys count (Shift+C = ژ)
 *     keyboardCandidates("سشپسعدل")   // ["samsung"]: meant a Latin name, the OS was on Persian
 *
 * Every layout gives one candidate; which one is right is for the caller to decide
 * (fa-search-kit/rescue keeps the first one the search index knows).
 *
 * The tables follow bench/lib/keyboards.ts on every key that types a letter (tested): Windows "Persian
 * (Standard)" (ISIRI 9147; macOS "Persian – Standard" has the same letters),
 * Windows legacy "Persian" (kbdfa) and macOS "Persian – Legacy".
 */

/**
 * The US keys that type a letter on some layout (unshifted, then shifted). Other keys
 * pass through: they type digits, punctuation or marks, which search treats alike.
 */
const KEYS = "`qwertyuiop[]\\asdfghjkl;'zxcvbnm,/ASDFGHJZXCVBNM";
/** Persian letters (global: count them with `match`). */
export const LETTERS = /[\u0621-\u063a\u0641-\u064a\u067e\u0686\u0698\u06a9\u06af\u06c0\u06cc]/g;
/** In a layout string: the key types nothing a search keeps (nothing, a mark, ZWJ, tatweel). */
const NOTHING = "\0";

/** What each key of `KEYS` types on each layout. */
export const LAYOUTS: Record<string, string> = {
  isiri9147: "\u0000ضصثقفغعهخحجچ\\شسیبلاتنمکگظطزرذدپو/ؤئيإأآةكطژ\u0000\u200c\u0000ء",
  "win-legacy": "÷ضصثقفغعهخحجچپشسیبلاتنمکگظطزرذدئو/\u0000\u0000\u0000\u0000ۀآ\u0000ةيژؤإأء",
  "mac-legacy": "پضصثقفغعهخحجچ\\شسیبلاتنمکگظطذدزرو،ژ«»ي\u0000\u0000آ\u0000'\u0000ئءأأؤ",
};

/** The text that appears when the keys `text` (as US characters) are typed on `layout`. Other characters pass through. */
export function toPersian(text: string, layout: string): string {
  let out = "";
  for (const ch of text) {
    const i = KEYS.indexOf(ch);
    const c = i < 0 ? ch : layout[i]!;
    out += c === NOTHING ? "" : c;
  }
  return out;
}

/** The US characters of the keys that type `text` on `layout` (unshifted first); Persian digits as digits. Other characters pass through. */
export function toLatin(text: string, layout: string): string {
  let out = "";
  for (const ch of text) {
    const i = ch === NOTHING ? -1 : layout.indexOf(ch);
    const d = ch.charCodeAt(0) - 0x6f0;
    out += i >= 0 ? KEYS[i] : d >= 0 && d < 10 ? d : ch;
  }
  return out;
}

/**
 * What a run of text (no spaces) may have been meant as on one layout. Latin keys
 * become Persian; a capitalized first letter (a phone capitalizing the first word)
 * is also tried lowercase; a candidate is dropped where a key types nothing, a letter key
 * types no letter, or a run with digits has fewer than three letters. Persian text becomes Latin only when it spells a name or a model
 * (letters and digits).
 */
export function layoutCandidates(run: string, layout: string): string[] {
  if (/[\u0600-\u06ff]/.test(run)) {
    const latin = toLatin(run, layout);
    return /^[a-z\d]*[a-z][a-z\d]*$/i.test(latin) ? [latin.toLowerCase()] : [];
  }
  const typed = /^[A-Z][^A-Z]*$/.test(run) ? [run, run[0]!.toLowerCase() + run.slice(1)] : [run];
  const letters = (t: string, re: RegExp) => t.match(re)?.length ?? 0;
  const latin = letters(run, /[A-Za-z]/g);
  // Every letter key typed a Persian letter («S70» is «»70» on the standard layout, a number,
  // not a word), and a run with digits (a model code) needs three letters.
  return typed.map((t) => toPersian(t, layout)).filter((c) => {
    const n = letters(c, LETTERS);
    return c.length === run.length && !/[A-Za-z]/.test(c) && n >= latin && (n >= 3 || !/\d/.test(run));
  });
}

/** `layoutCandidates` over every layout, without duplicates or the run itself. */
export function keyboardCandidates(run: string): string[] {
  const out = new Set(Object.values(LAYOUTS).flatMap((l) => layoutCandidates(run, l)));
  out.delete(run);
  return [...out];
}
