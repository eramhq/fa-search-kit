/**
 * The analyzer: normalize → tokenize → stem (→ lexicon), one function for
 * index time and query time.
 *
 * Index mode may emit extra terms, for the spellings a searcher might type
 * instead (a ZWNJ compound's parts, the other half-space spelling, the word
 * without its madda); query mode emits exactly one term per token, because
 * Pagefind and FlexSearch require every query word to match. Query terms are
 * always a subset of the index terms of the same text.
 */
import { normalizeText, ZWNJ, type NormalizeOptions } from "./normalize.ts";
import { Stemmer, type CliticOptions, type Lexicon, type StemOptions } from "./stem.ts";
import { tokenize, type Token } from "./tokenize.ts";

export type Profile = "light" | "standard" | "full";
export type Mode = "index" | "query";

export interface AnalyzerOptions extends NormalizeOptions, StemOptions {
  /**
   * آ → ا (H7, default true): index the madda-less spelling's term too, so a query
   * typed without the madda finds the page and one typed with it matches exactly as
   * before. Folding before stemming instead makes Snowball misread «می‌آید» → «می»,
   * «آستین» → «است» (bench/results/experiments.md).
   */
  alefMadda?: boolean;
  /** light: normalize + tokenize; standard: + Snowball and its fixes; full: + lexicon. */
  profile?: Profile;
  /** Rejoin affixes typed with a space («می روم», «کتاب ها»). */
  rejoin?: boolean;
  /**
   * ZWNJ compounds (H5): "both" also indexes the parts («کتاب‌خانه» → کتابخانه, کتاب,
   * خانه; in light, every half-space segment, so «کتاب‌ها» also indexes کتاب); queries keep the whole.
   */
  zwnj?: "keep" | "both";
  /**
   * Index the other half-space spelling too (H5b): for «قهوه‌ای» also the term of
   * «قهوهای», and for «سگهای» also the term of «سگ‌های», since people type both and
   * the stemmer reads them differently. Index mode only; queries are unchanged.
   */
  spellings?: boolean;
  /**
   * Verbs (H10, full profile): "lemma" maps every form to its past stem
   * («می‌شود», «شدند» → «شد»); "stem" keeps Snowball's tense-keeping stem. Engines
   * that require every query word (Pagefind, FlexSearch) need "lemma" to find another
   * tense; engines that match any word (MiniSearch, Orama, Lunr) find the page through
   * the other words, and there a lemma as common as «شد» only hurts ranking.
   */
  verbs?: "lemma" | "stem";
}

export interface Analyzer {
  analyze(text: string, options?: { mode?: Mode }): string[];
  /** Tokens with offsets into `text`, for highlighting. */
  tokens(text: string): Token[];
}

/** Standard trusts only a ZWNJ or a preceding ها; full also strips joined clitics, guarded by the keep list (H1). */
const DEFAULT_CLITICS: CliticOptions = { zwnj: true, plural: true };
const FULL_CLITICS: CliticOptions = { zwnj: true, plural: true, joinedMin: 3, singleMin: 3 };
/** A joined word that may hide a half-space before a suffix: «سگهای» = سگ‌های, «قهوهای» = قهوه‌ای. */
const JOINED_SUFFIX = /^(.{2,}?)(هایی|های|ها)$/;

/** Parts of a ZWNJ compound, with prefixes and suffixes left on their host: «کتاب‌خانه‌ها» → کتاب, خانه‌ها. */
const AFFIX = /^(?:ن?می|ی|ای|ام|ات|اش|ایم|اید|اند|ها|های|هایی|هایم|هایت|هایش|مان|تان|شان|هایمان|هایتان|هایشان|تر|ترین)$/;
function parts(token: string): string[] {
  const out: string[] = [];
  let prefix = "";
  for (const seg of token.split(ZWNJ)) {
    if (/^ن?می$/.test(seg)) prefix += seg + ZWNJ;
    else if (out.length && !prefix && AFFIX.test(seg)) out[out.length - 1] += ZWNJ + seg;
    else { out.push(prefix + seg); prefix = ""; }
  }
  if (prefix) out.push(prefix.slice(0, -1));
  return out;
}

export function createAnalyzer(options: AnalyzerOptions = {}): Analyzer {
  const profile = options.profile ?? "standard";
  if (profile === "full" && !options.lexicon) throw new Error('profile "full" needs a lexicon: import { lexicon } from "fa-search/lexicon"');
  // Defaults are the experiments' decisions (bench/results/experiments.md).
  const stemming = profile !== "light";
  const alef = options.alefMadda ?? true; // H7
  const norm: NormalizeOptions = { hamzaYeh: options.hamzaYeh ?? true };
  const rejoin = options.rejoin ?? true;
  const zwnj = options.zwnj ?? "both"; // H5
  const spellings = options.spellings ?? stemming; // H5b
  const stemmer = !stemming ? null : new Stemmer({
    closedSplit: true,
    joinedMi: "rule", // H2; in full the lexicon's verb analysis runs first, the rule covers verbs it lacks
    negation: "keep", // H3
    derivational: "keep", // H8
    clitics: profile === "full" ? FULL_CLITICS : DEFAULT_CLITICS, // H1
    ...options,
    lexicon: profile === "full" ? options.lexicon : undefined,
    verbLemmas: options.verbs !== "stem",
  });
  const term = (t: string) => (stemmer ? stemmer.stem(t) : t.replaceAll(ZWNJ, ""));

  const tokens = (text: string, withMap: boolean) => tokenize(normalizeText(text, norm, withMap), rejoin);

  return {
    tokens: (text) => tokens(text, true),
    analyze(text, { mode = "index" } = {}) {
      const out: string[] = [];
      for (const { text: t } of tokens(text, false)) {
        const whole = term(t);
        out.push(whole);
        if (spellings && mode === "index") {
          const other: string[] = [];
          if (t.includes(ZWNJ)) other.push(t.replaceAll(ZWNJ, ""));
          else {
            const m = JOINED_SUFFIX.exec(t);
            if (m) other.push(m[1] + ZWNJ + m[2]);
            // Not «هی»: «ماهی» is fish, not ماه + ی.
            if (/.های$/.test(t)) other.push(t.slice(0, -2) + ZWNJ + "ای");
          }
          for (const o of other) { const s = term(o); if (s !== whole) out.push(s); }
        }
        if (alef && mode === "index" && t.includes("آ")) {
          const bare = term(t.replaceAll("آ", "ا"));
          if (bare !== whole) out.push(bare);
        }
        if (zwnj === "both" && mode === "index" && t.includes(ZWNJ)) {
          // Without a stemmer, every half-space segment, as stock engines that split at ZWNJ index it.
          for (const p of stemming ? parts(t) : t.split(ZWNJ)) { const s = term(p); if (s !== whole) out.push(s); }
        }
      }
      return out.filter(Boolean);
    },
  };
}
