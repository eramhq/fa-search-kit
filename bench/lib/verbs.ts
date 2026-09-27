/**
 * A small Persian verb conjugator over Hazm's `past#present` stem list (MIT).
 *
 * Only the benchmark uses it: to spot the verb at the end of a title and swap it
 * for another tense a searcher might type. Forms are written the standard way
 * (می + ZWNJ); how the half-space gets typed is a separate variant.
 */
import { readFileSync } from "node:fs";
import { ZWNJ } from "./persian.ts";

export type Tense = "past" | "pastProg" | "presProg" | "subj" | "inf" | "participle";

export interface VerbForm {
  form: string;
  past: string;
  present: string;
  tense: Tense;
  /** 0–5: 1sg 2sg 3sg 1pl 2pl 3pl. -1 for non-finite forms. */
  person: number;
  negative: boolean;
}

const PRESENT_ENDINGS = ["م", "ی", "د", "یم", "ید", "ند"];
const PAST_ENDINGS = ["م", "ی", "", "یم", "ید", "ند"];

/** Present stems ending in alef take a glide yeh before endings: افزا → افزاید. */
const glide = (stem: string) => (/[اآ]$/.test(stem) ? stem + "ی" : stem);

/** Prefix a stem with ب or ن, handling the initial-alef spelling changes. */
function prefix(p: "ب" | "ن", stem: string): string {
  if (stem.startsWith("آ")) return `${p}یا${stem.slice(1)}`; // آمد → نیامد, آ → بیا
  if (stem.startsWith("ا")) return `${p}ی${stem.slice(1)}`; // افتاد → نیفتاد
  return p + stem;
}

export function conjugate(past: string, present: string): VerbForm[] {
  const out: VerbForm[] = [];
  const add = (form: string, tense: Tense, person: number, negative: boolean) =>
    out.push({ form, past, present, tense, person, negative });
  const pres = glide(present);
  for (let p = 0; p < 6; p++) {
    for (const negative of [false, true]) {
      const n = negative ? "ن" : "";
      add((negative ? prefix("ن", past) : past) + PAST_ENDINGS[p], "past", p, negative);
      add(`${n}می${ZWNJ}${past}${PAST_ENDINGS[p]}`, "pastProg", p, negative);
      if (present) {
        add(`${n}می${ZWNJ}${pres}${PRESENT_ENDINGS[p]}`, "presProg", p, negative);
        add(prefix(negative ? "ن" : "ب", pres) + PRESENT_ENDINGS[p], "subj", p, negative);
      }
    }
  }
  add(past + "ن", "inf", -1, false);
  add(prefix("ن", past) + "ن", "inf", -1, true);
  add(past + "ه", "participle", -1, false);
  add(prefix("ن", past) + "ه", "participle", -1, true);
  return out;
}

export class Verbs {
  readonly byForm = new Map<string, VerbForm[]>();
  readonly pairs: [string, string][];

  constructor(verbsDat: string) {
    this.pairs = verbsDat.split("\n").map((l) => l.trim()).filter((l) => l.includes("#") && !l.startsWith("#"))
      .map((l) => l.split("#") as [string, string]);
    for (const [past, present] of this.pairs) {
      for (const f of conjugate(past, present)) {
        const list = this.byForm.get(f.form) ?? [];
        list.push(f);
        this.byForm.set(f.form, list);
      }
    }
  }

  static load(url: URL): Verbs {
    return new Verbs(readFileSync(url, "utf8"));
  }

  analyze(token: string): VerbForm[] {
    return this.byForm.get(token) ?? [];
  }

  /** The form of (past, present) with the given tense/person/polarity, if any. */
  generate(past: string, present: string, tense: Tense, person: number, negative: boolean): string | undefined {
    return conjugate(past, present).find((f) => f.tense === tense && f.person === person && f.negative === negative)?.form;
  }
}
