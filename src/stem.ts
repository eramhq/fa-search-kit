/**
 * Stemming: Snowball's Persian stemmer (vendored, not forked), wrapped with the
 * fixes it cannot make on its own, and an optional lexicon layer.
 *
 * Snowball behaviours this works around (each checked by running it):
 * - it deletes every ZWNJ before stripping suffixes, so «نامه‌ای» → «نام»;
 * - it strips می only after a ZWNJ, so «میکند» stays whole;
 * - it never strips مان/تان/شان, and strips the ان out of them («کتابمان» → «کتابم»);
 * - its lexical-ان exceptions are spelled with آ, so their madda-less spellings
 *   (indexed too, see the analyzer) need protecting: «اسمان» must not become «اسم».
 */
import PersianStemmer from "../vendor/snowball/persian-stemmer.js";
import { MI_EXCEPTIONS, PROTECTED } from "./words.ts";
import { ZWNJ } from "./normalize.ts";

/** The optional lexicon layer (`fa-search/lexicon`); kept out of the core bundle. */
export interface Lexicon {
  /**
   * Word → its term, ahead of every rule: words that look like word + suffix
   * but are not (مهمان, روند, فیلم) map to themselves; broken plurals to their
   * singular (کتب → کتاب).
   */
  terms: Map<string, string>;
  /** A verb form's past stem («می‌روم» → «رفت»), with ن in front when negation is kept; else undefined. */
  verb(word: string, keepNegation: boolean): string | undefined;
}

export interface StemOptions {
  /**
   * Joined «میکند» (H2): "zwnj" leaves it to Snowball (strips only after a ZWNJ);
   * "rule" strips it when the rest ends like a verb and the word is not a known
   * exception; "lexicon" only when the rest is a known verb form.
   */
  joinedMi?: "zwnj" | "rule" | "lexicon";
  /** Negation (H3): "keep" leaves نمی/ن (Snowball's choice), "merge" folds it away. */
  negation?: "keep" | "merge";
  /** H1: which clitic signals to trust. */
  clitics?: CliticOptions;
  /** Stem only the part before a ZWNJ + closed suffix («نامه‌ای» → stem «نامه»). */
  closedSplit?: boolean;
  /**
   * Derivational suffixes (H8): "strip" is Snowball's behaviour («دستگاه» → «دست»,
   * «زندگی» → «زند»); "keep" puts back a derivational suffix Snowball cut, so only
   * inflection comes off.
   */
  derivational?: "strip" | "keep";
  lexicon?: Lexicon;
  /** Use the lexicon's verb analysis (H10; default true). */
  verbLemmas?: boolean;
}

export interface CliticOptions {
  /** After a ZWNJ, مان/تان/شان are clitics («کتاب‌مان»). */
  zwnj?: boolean;
  /** After ها/های they are clitics too («کتابهایمان»). */
  plural?: boolean;
  /** Joined «کتابمان»: strip مان/تان/شان when this many letters remain (0 = never). */
  joinedMin?: number;
  /**
   * Joined ش/م («کتابش»): strip when this many letters remain (0 = never). Not ت:
   * "your" is rare in text and many words end in ت.
   */
  singleMin?: number;
}

/** Endings that follow a ZWNJ only as suffixes: ezafe/indefinite ی, copula and person endings, possessives, plural. */
const CLOSED = new Set(["ی", "ای", "ام", "ات", "اش", "ایم", "اید", "اند", "ها", "های", "هایی", "هایم", "هایت", "هایش"]);
const PLURAL_CLITICS = new Set(["مان", "تان", "شان", "هایمان", "هایتان", "هایشان"]);
const ARABIC = /[\u0620-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF]/;
/** Verb forms end in a person ending, or in the past stem's ت/د. */
const VERB_END = /(?:[مید]|ند|ت)$/;
/** Snowball's derivational suffixes (its inflectional ones are ها ات ان گان یان ین تر ترین اش ام های). */
const DERIVATIONAL = /^(?:گاه|مند|وار|گار|بان|انه|ناک|انی|یت|گی|یی)/;

export class Stemmer {
  private readonly snowball = new PersianStemmer();
  private readonly cache = new Map<string, string>();
  private readonly o: StemOptions;
  private readonly c: CliticOptions;

  constructor(options: StemOptions = {}) {
    this.o = options;
    this.c = options.clitics ?? {};
  }

  stem(token: string): string {
    let s = this.cache.get(token);
    if (s === undefined) {
      if (this.cache.size > 100_000) this.cache.clear();
      s = ARABIC.test(token) ? this.word(token) : token.replaceAll(ZWNJ, "");
      this.cache.set(token, s);
    }
    return s;
  }

  private word(w: string): string {
    const bare = w.replaceAll(ZWNJ, "");
    const lex = this.o.lexicon;
    const known = lex?.terms.get(bare);
    if (known !== undefined) return known;
    if (PROTECTED.has(bare)) return bare;

    // «نامه‌ای» → «نامه», «کتاب‌هایمان» → «کتاب»: the part after the last ZWNJ is a suffix.
    const z = w.lastIndexOf(ZWNJ);
    if (z > 0) {
      const tail = w.slice(z + 1);
      if ((this.o.closedSplit && CLOSED.has(tail)) || ((this.c.zwnj || this.c.plural) && PLURAL_CLITICS.has(tail))) {
        return this.word(w.slice(0, z));
      }
    }

    // A listed word under a joined plural («میدانهای»): Snowball would strip on past the list.
    const plural = lex && /^(.{2,}?)(?:ها|های|هایی)$/.exec(bare);
    if (plural && lex.terms.has(plural[1]!)) return lex.terms.get(plural[1]!)!;

    const verb = this.o.verbLemmas === false ? undefined : lex?.verb(bare, this.o.negation !== "merge");
    if (verb) return verb;

    let x = w;
    if (this.c.plural) {
      const m = /^(.{2,}?)ها(?:ی(?:مان|تان|شان|م|ت|ش)|مان|تان|شان)$/.exec(bare);
      if (m) return this.word(m[1]!);
    }
    if (this.c.joinedMin && !x.includes(ZWNJ)) {
      const m = /^(.+)(?:مان|تان|شان)$/.exec(x);
      if (m && m[1]!.length >= this.c.joinedMin) return this.word(m[1]!);
    }
    if (this.c.singleMin && !x.includes(ZWNJ) && x.length > this.c.singleMin) {
      const last = x.at(-1)!;
      if (last === "ش" || last === "م") return this.word(x.slice(0, -1));
    }

    if (!x.includes(ZWNJ)) {
      const m = /^(ن?می)(.{2,})$/.exec(x);
      if (m && this.o.joinedMi === "rule" && VERB_END.test(m[2]!) && !isMiException(x)) x = m[1] + ZWNJ + m[2];
    }
    if (this.o.negation === "merge" && x.startsWith("نمی" + ZWNJ)) x = x.slice(1);
    const s = this.snowball.stemWord(x);
    if (this.o.derivational === "keep") {
      const b = x.replaceAll(ZWNJ, "");
      const at = b.lastIndexOf(s);
      const cut = at >= 0 ? DERIVATIONAL.exec(b.slice(at + s.length)) : null;
      if (cut) return s + cut[0];
    }
    return s;
  }
}

/** A word that starts with می but is not a verb: listed whole, or by a prefix entry ending in "*". */
function isMiException(w: string): boolean {
  const b = w.startsWith("ن") ? w.slice(1) : w;
  for (let n = 3; n <= b.length; n++) if (MI_EXCEPTIONS.has(b.slice(0, n) + "*")) return true;
  return MI_EXCEPTIONS.has(b);
}
