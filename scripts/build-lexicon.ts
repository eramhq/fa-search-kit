/**
 * Build the word lists: src/lexicon/data.ts (the optional lexicon) and
 * src/words.ts (the few hundred bytes the core carries).
 *
 *     node scripts/build-lexicon.ts [--report]
 *
 * Inputs (mined in scripts/lib/mine.ts): Hazm's verb list (MIT) and
 * bench/data/vocab.tsv (word counts over the raw benchmark sources). Only single words and counts are taken from the
 * vocabulary, never text; the words kept are ordinary dictionary words chosen by
 * the rules below. Hazm's words.dat is not used (its provenance vs Bijankhan,
 * GPL, is unchecked).
 *
 * - verbs: Hazm past#present pairs. A present stem with several pasts maps to the
 *   most frequent one (کن → کرد, not کند); a past stem that is also a frequent
 *   verb's present form (کند = کن + د) is dropped, since «کند» means "does".
 * - keep: words the rules would strip (a verb ending, a clitic, Snowball's ان…)
 *   that take a plural themselves (مهمان‌ها, روندها, فیلم‌ها): a real word, not
 *   word + suffix. Participles of known verbs are left to merge (گفته → گفت).
 * - core PROTECTED: the same test on the standard profile, for frequent words
 *   Snowball merges with another frequent word (مهمان → مهم, هفته → هفت).
 * - core MI_EXCEPTIONS: frequent words starting with می that are not verbs
 *   (their half-space form is not attested), as words or prefix entries.
 * - plurals: a curated list of Arabic broken plurals (below), kept when attested.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createAnalyzer } from "../src/analyzer.ts";
import { createLexicon } from "../src/lexicon/index.ts";
import { normalizeText } from "../src/normalize.ts";
import { PROTECTED } from "../src/words.ts";
import { count, droppedPasts, pluralizable, VERBS, verbPairs, vocab, ZWNJ } from "./lib/mine.ts";

// Mine against the rules alone: the previous build's list must not hide what they do.
PROTECTED.clear();

const { values } = parseArgs({ options: { report: { type: "boolean", default: false } } });
const root = new URL("..", import.meta.url);

/** Merges that are the point of stemming: superlative/comparative, ordinals, the ها plural. */
const intended = (w: string, t: string) =>
  w.startsWith(t) && /^(?:ترین|تر|ها|های|هایی)$/.test(w.slice(t.length)) || (/(?:م|تر)$/.test(t) && w === t + "ین");
/** Reviewed by hand (bench/results/lexicon-build.md): real words the plural test misses. */
const EXTRA_KEEP = ["مانند", "مردم", "شیرین", "نشان", "بادام", "شاهین", "تخمین", "مجازات", "بنیان", "سوتین", "لاتین", "بنزین", "ماشین", "شدید"];
/** Reviewed by hand: plurals and inflections the plural test lets through. */
const DENY = new Set(["مردان", "داروهای", "اخبار", "نداشته", "درگذشته", "انتشارات", "دارای", "آید", "سازند"]);

// --- curated broken plurals (Arabic plurals used in Persian) ------------------------

const BROKEN_PLURALS: [string, string][] = [
  ["کتب", "کتاب"], ["علوم", "علم"], ["افراد", "فرد"], ["اشخاص", "شخص"], ["مسائل", "مسئله"], ["مراکز", "مرکز"],
  ["منابع", "منبع"], ["مدارس", "مدرسه"], ["مناطق", "منطقه"], ["شرایط", "شرط"], ["اهداف", "هدف"], ["اعضا", "عضو"],
  ["اعضای", "عضو"], ["اقوام", "قوم"], ["آثار", "اثر"], ["اموال", "مال"], ["اوقات", "وقت"], ["ادیان", "دین"],
  ["اشعار", "شعر"], ["اسرار", "سر"], ["اطفال", "طفل"], ["اعمال", "عمل"], ["اقسام", "قسم"], ["انواع", "نوع"],
  ["ارقام", "رقم"], ["اصول", "اصل"], ["عوامل", "عامل"], ["قوانین", "قانون"], ["مواد", "ماده"], ["موارد", "مورد"],
  ["مسائلی", "مسئله"], ["مباحث", "مبحث"], ["مقالات", "مقاله"], ["مراحل", "مرحله"], ["مراسم", "مرسوم"], ["معابد", "معبد"],
  ["مساجد", "مسجد"], ["ملل", "ملت"], ["دول", "دولت"], ["علما", "عالم"], ["علمای", "عالم"], ["فقها", "فقیه"],
  ["شعرا", "شاعر"], ["شعرای", "شاعر"], ["وزرا", "وزیر"], ["وزرای", "وزیر"], ["امرا", "امیر"], ["حقوق", "حق"],
  ["اخبار", "خبر"], ["اساتید", "استاد"], ["اسناد", "سند"], ["ادوار", "دوره"], ["اطلاعات", "اطلاع"], ["احزاب", "حزب"],
  ["اقلام", "قلم"], ["ابعاد", "بعد"], ["ارکان", "رکن"], ["اجزا", "جزء"], ["اجزای", "جزء"], ["اسامی", "اسم"],
  ["اشیا", "شی"], ["اشیای", "شی"], ["عناصر", "عنصر"], ["جزایر", "جزیره"], ["حوادث", "حادثه"], ["وقایع", "واقعه"],
  ["فواید", "فایده"], ["نتایج", "نتیجه"], ["ذخایر", "ذخیره"], ["قبایل", "قبیله"], ["رسائل", "رساله"], ["عقاید", "عقیده"],
  ["مجالس", "مجلس"], ["مصادر", "مصدر"], ["معانی", "معنی"], ["مظاهر", "مظهر"], ["مکاتب", "مکتب"], ["منازل", "منزل"],
  ["اماکن", "مکان"], ["امور", "امر"], ["ائمه", "امام"], ["اولاد", "ولد"], ["ارواح", "روح"], ["اجساد", "جسد"],
  ["اشکال", "شکل"], ["الوان", "لون"], ["اعیاد", "عید"], ["ایام", "یوم"], ["بلاد", "بلد"], ["جوامع", "جامعه"],
  ["طرق", "طریق"], ["حروف", "حرف"], ["دروس", "درس"], ["رسوم", "رسم"], ["صفوف", "صف"], ["فنون", "فن"],
  ["قرون", "قرن"], ["قلوب", "قلب"], ["نفوس", "نفس"], ["ملوک", "ملک"], ["عیون", "عین"], ["شئون", "شأن"],
  ["اساطیر", "اسطوره"], ["تصاویر", "تصویر"], ["مقادیر", "مقدار"], ["دفاتر", "دفتر"], ["مشاهیر", "مشهور"], ["قواعد", "قاعده"],
];
const plurals = BROKEN_PLURALS.map(([p, s]) => [normalizeText(p).text, normalizeText(s).text] as const)
  .filter(([p]) => count(p) >= 20);
const PLURALS = plurals.map(([p, s]) => `${p}>${s}`).join(" ");

// --- keep list (lexicon) ------------------------------------------------------------

const verbLex = createLexicon(VERBS, "", PLURALS);
const pastStems = new Set(verbPairs.map(([p]) => p));
/** The most aggressive rules any profile or experiment arm uses, so the list fits them all. */
const aggressive = createAnalyzer({
  profile: "full", lexicon: verbLex, derivational: "keep",
  clitics: { zwnj: true, plural: true, joinedMin: 2, singleMin: 3 },
});
const term = (a: typeof aggressive, w: string) => a.analyze(w, { mode: "query" }).join(" ");
const KEEP_MIN = 40;
const keepList: { w: string; t: string; n: number }[] = [];
for (const [w, n] of vocab) {
  if (n < KEEP_MIN || w.includes(ZWNJ) || w.length < 3) continue;
  const t = term(aggressive, w);
  if (t === w || DENY.has(w) || intended(w, t)) continue;
  if (!pluralizable(w) && !EXTRA_KEEP.includes(w)) continue;
  // Participles of known verbs merge on purpose (گفته → گفت, شده → شد).
  if (w.endsWith("ه") && (pastStems.has(t) || pastStems.has(t.slice(1)))) continue;
  // No test on how common the stripped form is: even a rare one breaks the word's
  // other spellings («برند» → «رندید» while «برندهای» → «برند»).
  keepList.push({ w, t, n });
}
// ن-initial words that are not negated verbs («نزد» = at, «نبرد» = battle, «نیا» =
// grandfather): a real negative form is much rarer than its positive, these are not.
const merging = createAnalyzer({ profile: "full", lexicon: verbLex, derivational: "keep", negation: "merge" });
const negKeep: string[] = [];
for (const [w, n] of vocab) {
  if (n < 100 || !w.startsWith("ن") || w.includes(ZWNJ) || keepList.some((k) => k.w === w)) continue;
  const kept = term(aggressive, w), merged = term(merging, w);
  // Only where negation alone makes the difference: «نزد» → نزد kept, → زد merged.
  if (kept !== "ن" + merged || ["بود", "است", "هست"].includes(merged)) continue;
  // Its positive counterpart, with the ب/ن glide undone («نیامد» → آمد, «نیفتد» → افتد).
  const bare = w.slice(1);
  const p = bare.startsWith("یا") ? "آ" + bare.slice(2) : bare.startsWith("ی") ? "ا" + bare.slice(1) : bare;
  const positive = Math.max(count(bare), count(p)) + count("می" + ZWNJ + p) + count("می" + p);
  if (n > 0.5 * positive) { keepList.push({ w, t: merged, n }); negKeep.push(w); }
}
keepList.sort((a, b) => b.n - a.n);
const KEEP = keepList.map((k) => k.w).join(" ");

// --- core lists ---------------------------------------------------------------------

const standard = createAnalyzer({ profile: "standard", derivational: "keep" });
const PROTECT_MIN = 3000;
const protectedWords: { w: string; t: string; n: number }[] = [];
for (const [w, n] of vocab) {
  if (n < PROTECT_MIN || w.includes(ZWNJ)) continue;
  const t = term(standard, w);
  if (t === w || DENY.has(w) || intended(w, t) || count(t) < PROTECT_MIN) continue;
  if (!pluralizable(w) && !EXTRA_KEEP.includes(w)) continue;
  if (w.endsWith("ه") && (pastStems.has(t) || pastStems.has(t.slice(1)))) continue;
  if (w.startsWith("می")) continue; // MI_EXCEPTIONS covers these
  protectedWords.push({ w, t, n });
}
protectedWords.sort((a, b) => b.n - a.n);
const ALEF_AN = ["اذربایجان", "اتشفشان", "اسمان", "المان"];
/** Reviewed by hand: below the count threshold, but a Snowball inconsistency worth the bytes (مهمان → مهم). */
const EXTRA_PROTECT = ["مهمان", "میهمان"];

const MI_MIN = 200;
const VERB_END = /(?:[مید]|ند|ت)$/;
const miWords: string[] = [];
const verbLike: string[] = [];
for (const [w, n] of vocab) {
  const m = /^(ن?می)(.{2,})$/.exec(w);
  if (!m || w.includes(ZWNJ)) continue;
  const z = count(m[1] + ZWNJ + m[2]);
  if (z / (n + z) >= 0.5 && n + z >= 20) verbLike.push(w);
  else if (n >= MI_MIN && z / (n + z) < 0.05 && VERB_END.test(m[2]!) && !w.startsWith("ن")) miWords.push(w);
}
// Collapse to prefix entries where a prefix covers several exceptions and no verb-like word.
const prefixes = new Map<string, number>();
for (const w of miWords) for (let k = 4; k < w.length; k++) prefixes.set(w.slice(0, k), (prefixes.get(w.slice(0, k)) ?? 0) + 1);
const chosen = [...prefixes].filter(([p, c]) => c >= 3 && !verbLike.some((v) => v.startsWith(p)))
  .sort((a, b) => a[0].length - b[0].length).map(([p]) => p);
const minimal = chosen.filter((p) => !chosen.some((q) => q !== p && p.startsWith(q)));
const miEntries = [...minimal.map((p) => p + "*"), ...miWords.filter((w) => !minimal.some((p) => w.startsWith(p)))];

// --- write --------------------------------------------------------------------------

const header = "/** Generated by scripts/build-lexicon.ts; do not edit. See that file for how each list is chosen. */\n";
writeFileSync(new URL("src/lexicon/data.ts", root), header +
  `\n/** Hazm past#present stem pairs (MIT), most frequent past first. */\nexport const VERBS = ${JSON.stringify(VERBS)};\n` +
  `\n/** Words never stripped: they take a plural themselves. */\nexport const KEEP = ${JSON.stringify(KEEP)};\n` +
  `\n/** Broken plural>singular. */\nexport const PLURALS = ${JSON.stringify(PLURALS)};\n`);

writeFileSync(new URL("src/words.ts", root), `/**
 * Word lists in the core bundle. Generated by scripts/build-lexicon.ts; do not edit.
 * Kept to a few hundred bytes: the core budget is 5 KB gzipped, Snowball included.
 */

/** Words that start with می but are not verbs; "*" marks a prefix entry. */
export const MI_EXCEPTIONS = new Set(${JSON.stringify(miEntries.join(" "))}.split(" "));

/**
 * Frequent words Snowball over-stems into another frequent word (مهمان → مهم),
 * plus its آ-spelled ان exceptions as they read once آ is folded (اسمان, not اسم).
 */
export const PROTECTED = new Set(${JSON.stringify([...ALEF_AN, ...EXTRA_PROTECT, ...protectedWords.map((p) => p.w)].join(" "))}.split(" "));
`);

console.log(`verbs: ${verbPairs.length} pairs (dropped ${droppedPasts.length}: ${droppedPasts.filter((d) => !d.endsWith("(unattested)")).join(", ")}; and ${droppedPasts.filter((d) => d.endsWith("(unattested)")).length} with < 20 uses of all their forms)`);
console.log(`not negated verbs (${negKeep.length}): ${negKeep.slice(0, 40).join(" ")}`);
console.log(`keep: ${keepList.length} words; plurals: ${plurals.length}; core protected: ${protectedWords.length}; mi exceptions: ${miEntries.length} entries (${miWords.length} words)`);
if (values.report) {
  const lines = [
    "# Lexicon build report", "",
    `## Core PROTECTED (${protectedWords.length})`, "", ...protectedWords.map((p) => `- «${p.w}» ${p.n} → would be «${p.t}» (${count(p.t)})`), "",
    `## Core MI_EXCEPTIONS (${miEntries.length})`, "", miEntries.join(" · "), "",
    `## Keep list (${keepList.length}, top 400 by count)`, "", ...keepList.slice(0, 400).map((k) => `- «${k.w}» ${k.n} → would be «${k.t}» (${count(k.t)})`),
  ];
  writeFileSync(new URL("bench/results/lexicon-build.md", root), lines.join("\n") + "\n");
  console.log("wrote bench/results/lexicon-build.md");
}
