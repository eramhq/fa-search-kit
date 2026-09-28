# Persian word-type lemma labels (fa-search-kit, Phase 4b)

You label Persian **word types** (single words, no sentence context) for a search engine
that wants every inflected form of a word to find pages with the other forms. The words
come from a frequency list of Persian news, Wikipedia and product titles; `count` is how
often the word occurs there (a hint to which reading is common).

## Input

`shard-NN.tsv`: one word per line, `id<TAB>word<TAB>count`. The word is written as it most
often appears (with its half-space, ZWNJ, where people use one).

## What to decide for each word

List every **common reading** of the word as it is used in Persian text, with a rough
share of its uses (shares sum to about 1; ignore readings under ~5%). For each reading
give its **lemma** and **kind**.

The lemma removes **inflection only**:

- plural: ها / های, ان / یان, ات, گان, ین, and Arabic broken plurals → the singular
  («کتاب‌ها» → کتاب, «نویسندگان» → نویسنده, «حملات» → حمله, «مسائل» → مسئله);
- ezafe and indefinite ی / ای / یی («ابتدای» → ابتدا, «خانه‌ای» → خانه, «تعدادی» → تعداد);
- pronoun clitics م ت ش مان تان شان («کتابم» → کتاب);
- comparative and superlative تر / ترین → the plain adjective («سخت‌ترین» → سخت);
- verbs: person, tense, می / ب / ن, infinitive ن and perfect ه + ending → the **past stem**,
  preverb kept («می‌روم», «رفتند», «برود», «رفتن» → رفت; «برمی‌خیزد» → برخاست).
  Negated forms: lemma is the positive past stem, and `neg: true` («نمی‌روم» → رفت, neg).

The lemma **keeps derivation**; these are words of their own, lemma = the word itself:

- relational / nisba ی and abstract ی / یی: «علمی», «احتمالی», «ایرانی», «زندگی», «رهایی»;
- agent nouns and participles used as nouns or adjectives: «نویسنده», «گذشته», «خسته»;
- adjectives in ان and other derived words: «هراسان», «خندان», «دانشگاه»;
- proper names, even when they look like an inflected word: «کرمان», «مهران», «طالبان»,
  «آیدین»; brands and foreign words («والتر», «توییتر»).

When a word has two common readings (for example «کشتی»: ship / wrestling vs "you
killed"; «ماهی»: fish vs "a month"), list both with their shares.

## Output

Write `out-NN.jsonl` next to the shard: **one JSON object per input line, same order**, no
other text:

```json
{"id": 17, "word": "حملات", "readings": [{"lemma": "حمله", "kind": "noun", "neg": false, "share": 1}], "dominant": 0, "merge_ok": true, "confident": true}
```

- `kind`: one of `noun`, `adj`, `verb`, `adv`, `name`, `function` (pronoun, preposition,
  conjunction, number word, auxiliary), `other`.
- `lemma`: standard spelling, half-space (ZWNJ) where standard. For a verb, the past stem
  with its preverb, never the infinitive. For a name or a word of its own, the word itself.
- `neg`: true only for a negated verb form.
- `dominant`: the index of the reading with share ≥ 0.8, or `null` when no reading has it.
- `merge_ok`: true when the dominant reading is an inflected form of a different lemma, so a
  person searching that lemma would want pages with this word. False when the word is its
  own lemma, when there is no dominant reading, or when it is unclear.
- `confident`: false when you are unsure of the word (rare, a typo, a foreign word, a name
  you do not know).

Label only from your knowledge of Persian; do not look anything up for individual words.
Do not skip words, and keep the ids.
