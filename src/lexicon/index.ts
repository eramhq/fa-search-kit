/**
 * fa-search-kit/lexicon: the word lists Snowball's rules cannot do without.
 *
 *     import { createAnalyzer } from "fa-search-kit";
 *     import { lexicon } from "fa-search-kit/lexicon";
 *     const { analyze } = createAnalyzer({ profile: "full", lexicon });
 *
 * - verbs: present → past stems from Hazm's verb list (MIT), so «می‌روم»,
 *   «رفتند» and «برود» all become «رفت»;
 * - terms: words that look like word + suffix but are not (مهمان, روند, فیلم)
 *   and a short curated list of Arabic broken plurals (کتب → کتاب);
 * - lemmas: inflected forms the rules miss («نویسندگان» → نویسنده's term, «نظامیان»,
 *   comparatives, verbs outside the verb list), consulted only where the lists above
 *   leave a word to the rules.
 * Data: ./data.ts (scripts/build-lexicon.ts) and ./lemmas.ts (scripts/build-lemma.ts).
 */
import type { Lexicon } from "../stem.ts";
import { PLURALS, KEEP, VERBS } from "./data.ts";
import { LEMMAS } from "./lemmas.ts";

/** No bare imperative (ب/ن + stem, no ending): «برند», «بستر», «بند» are nouns far more often. */
const PRESENT_END = ["ند", "ید", "یم", "د", "م", "ی"];
/** Past stem endings: person, participle ه, infinitive ن, and the perfect («رفته‌اند» read without its ZWNJ). */
const PAST_END = ["ند", "ید", "یم", "م", "ی", "ه", "ن", "هاند", "هاید", "هایم", "هام", "های", "هاست", ""];
/** Shortest prefix first: «نشسته» is نشست + ه before it is ن + شسته. */
const PREFIXES = ["", "ب", "ن", "می", "نمی"];

/** Terms from the lists, then from the lemma edits; `has` stays the lists' (the stemmer's plural rule asks it). */
class Terms extends Map<string, string> {
  lemmas = new Map<string, string>();
  override get(w: string) {
    return super.get(w) ?? this.lemmas.get(w);
  }
}

export function createLexicon(verbs: string, keep: string, plurals: string, lemmas = ""): Lexicon {
  const pastOf = new Map<string, string>();
  const past = new Set<string>();
  for (const pair of verbs.split(" ")) {
    const [p, pres] = pair.split("#") as [string, string];
    past.add(p);
    if (pres && !pastOf.has(pres)) pastOf.set(pres, p);
  }
  const terms = new Terms();
  for (const w of keep.split(" ")) terms.set(w, w);
  for (const pair of plurals.split(" ")) {
    const [plural, singular] = pair.split(">") as [string, string];
    terms.set(plural, singular);
  }

  /** «بیاید», «نیفتاد»: after ب/ن, an initial آ/ا is written یا/ی. */
  const unglide = (rest: string) => (rest.startsWith("یا") ? "آ" + rest.slice(2) : rest.startsWith("ی") ? "ا" + rest.slice(1) : "");

  // Lemma edits: `verb/prefix/cut/append` labels, then `label:word,word`.
  const verbal = new Map<string, [string, string]>();
  const [head, ...lines] = lemmas ? lemmas.split("\n") : [""];
  const labels = head!.split(";").map((l) => l.split("/"));
  for (const line of lines) {
    const c = line.indexOf(":");
    const [v, p, k, a] = labels[+line.slice(0, c)]!;
    for (const w of line.slice(c + 1).split(",")) {
      const stem = w.slice(p!.length, w.length - +k!) + a;
      if (v === "v") verbal.set(w, [p!, stem]);
      else terms.lemmas.set(w, stem);
    }
  }

  function verb(b: string, keepNegation: boolean): string | undefined {
    const v = listed(b, keepNegation);
    if (v !== undefined || !verbal.has(b)) return v;
    const [p, stem] = verbal.get(b)!;
    return (keepNegation && (p === "نمی" || p === "ن") ? "ن" : "") + stem;
  }

  function listed(b: string, keepNegation: boolean): string | undefined {
    if (past.has(b)) return b;
    for (const prefix of PREFIXES) {
      if (!b.startsWith(prefix)) continue;
      const neg = keepNegation && prefix[0] === "ن" ? "ن" : "";
      const rests = [b.slice(prefix.length)];
      if (prefix === "ب" || prefix === "ن") rests.push(unglide(rests[0]!));
      for (const rest of rests) {
        if (rest.length < 2) continue;
        // Past: never with ب, and a bare past + ی is a noun far more often («کشتی», «کردی»).
        if (prefix !== "ب") {
          for (const end of PAST_END) {
            if (!rest.endsWith(end) || (!prefix && end === "ی")) continue;
            const stem = rest.slice(0, rest.length - end.length);
            if (past.has(stem)) return neg + stem;
          }
        }
        // Present: a bare one («کند», «شود») only with a 3rd-person ending; «کاری», «کارم» are nouns.
        for (const end of PRESENT_END) {
          if (!rest.endsWith(end) || (!prefix && end !== "د" && end !== "ند")) continue;
          const stem = rest.slice(0, rest.length - end.length);
          // The copula's «است» takes only ن («نیست»); «بیست» is twenty.
          if (stem === "است" && prefix !== "ن") continue;
          // Glide ی after a vowel-final stem: گو + ی + د, آ + ی + د.
          const p = pastOf.get(stem) ?? (stem.length > 1 && stem.endsWith("ی") ? pastOf.get(stem.slice(0, -1)) : undefined);
          if (p) return neg + p;
        }
      }
    }
    return undefined;
  }

  return { terms, verb };
}

export const lexicon: Lexicon = createLexicon(VERBS, KEEP, PLURALS, LEMMAS);
