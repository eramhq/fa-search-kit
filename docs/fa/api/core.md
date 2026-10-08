---
title: "API هسته و واژه‌نامه"
description: "خروجی‌های عمومی تحلیلگر، یکسان‌ساز، توکن‌ساز، بن‌یاب، واژه‌نامه و آمار را پیدا کنید."
---

# API هسته و واژه‌نامه

ماژول اصلی `fa-search-kit` است. برای انتخاب تنظیمات، [پروفایل‌ها](../profiles.md) را بخوانید؛ تابع‌های سطح پایین برای زمانی هستند که می‌خواهید زنجیره پردازش را خودتان بسازید.

```js
import { normalize, tokenize, Stemmer } from "fa-search-kit";
const tokens = tokenize(normalize("کتاب ها"));
console.log(JSON.stringify(tokens)); // => [{"text":"کتاب‌ها","start":0,"end":7}]
console.log(JSON.stringify(new Stemmer({ closedSplit: true }).stem("نامه‌ای"))); // => "نامه"
```

## fa-search-kit

تابع `createAnalyzer(options?: AnalyzerOptions): Analyzer` تحلیلگر می‌سازد. روش `Analyzer.analyze(text: string, options?: { mode?: Mode }): string[]` عبارت‌ها را برمی‌گرداند و حالت پیش‌فرض آن index است. روش `Analyzer.tokens(text: string): Token[]` توکن یکسان‌شده بدون بن‌یابی و همراه محدوده متن اصلی می‌دهد. `Mode` برابر `"index" | "query"` و `Profile` برابر `"light" | "standard" | "full"` است.

نوع `AnalyzerOptions` از `NormalizeOptions` و `StemOptions` گسترش می‌یابد. فیلدهای افزوده آن `profile`، `rejoin`، `zwnj: "keep" | "both"`، `spellings`، `alefMadda` و `verbs: "lemma" | "stem"` هستند. پیش‌فرض‌ها و ارتباط گزینه‌ها در [پروفایل‌ها](../profiles.md) آمده است. در تحلیلگر، `verbs` مراجعه به صورت پایه فعل را کنترل می‌کند و مقدار سطح پایین `verbLemmas` بازنویسی می‌شود.

تابع `normalize(text: string, options?: NormalizeOptions): Normalized` شیء `{ text: string, map: Uint32Array }` می‌دهد. تنها گزینه `NormalizeOptions`، فیلد `hamzaYeh?: boolean` است که بدون فعال‌سازی false است. قرار است هر نویسه خروجی با جفت موقعیت آغاز و پایان متن اصلی در `map[2*k]` و `map[2*k+1]` نگاشت شود. [اشکال نویسه‌های خارج از محدوده پایه](../recipes.md) فعلا این نگاشت را محدود می‌کند.

تابع `tokenize(normalized: Normalized, rejoin = true): Token[]` نتیجه یکسان‌سازی را دریافت می‌کند. نوع `Token` شامل `{ text: string, start: number, end: number }` است. اگر شیء دست‌ساز با map خالی بدهید، موقعیت‌ها به متن یکسان‌شده اشاره می‌کنند. برای نمایش، `analyzer.tokens(original)` را ترجیح دهید.

کلاس `new Stemmer(options?: StemOptions)` روش `stem(token: string): string` دارد. ورودی باید پیش‌تر یکسان‌سازی و توکن‌سازی شده باشد؛ این کلاس هیچ‌کدام را انجام نمی‌دهد. هر نمونه نتیجه‌ها را ذخیره می‌کند. پیش‌فرض‌های آن با `createAnalyzer()` فرق دارد: شیء ضمیر پیوسته، اصلاح پسوند پس از نیم‌فاصله، حفظ پسوند اشتقاقی و قاعده می چسبیده خودکار فعال نیستند.

### StemOptions و CliticOptions

- `joinedMi?: "zwnj" | "rule" | "lexicon"`: درج نیم‌فاصله برای پیشوند چسبیده فقط در حالت `rule` پیاده شده است. مقدار `lexicon` فعلا شاخه اختصاصی بن‌یابی مشروط ندارد؛ مراجعه معمول به فعل واژه‌نامه مستقل از آن است. به وعده گسترده‌تر توضیح سورس تکیه نکنید.
- `negation?: "keep" | "merge"`: صورت منفی واژه‌نامه و قاعده صریح نمی را کنترل می‌کند؛ تشخیص عمومی مثبت و منفی نیست.
- `closedSplit?: boolean`: بخش میزبان پیش از پسوند شناخته‌شده پس از نیم‌فاصله را بن‌یابی می‌کند.
- `derivational?: "strip" | "keep"`: در حالت keep، برخی پایان‌های اشتقاقی حذف‌شده توسط Snowball را حفظ می‌کند.
- `lexicon?: Lexicon` و `verbLemmas?: boolean`: مراجعه اختیاری به واژه و فعل؛ مراجعه فعل در Stemmer مستقیم فعال است مگر false باشد.
- `clitics?: CliticOptions`: شامل `zwnj?: boolean`، `plural?: boolean`، `joinedMin?: number` و `singleMin?: number` است. حداقل صفر قاعده چسبیده مربوط را غیرفعال می‌کند. قاعده تک‌حرفی ش و م را پوشش می‌دهد، نه همه پایان‌های ملکی را.

خروجی اصلی علاوه بر چهار خروجی زمان اجرای بالا، نوع‌های `Analyzer`، `AnalyzerOptions`، `Mode`، `Profile`، `Normalized`، `NormalizeOptions`، `Token`، `CliticOptions`، `Lexicon` و `StemOptions` را صادر می‌کند.

## fa-search-kit/lexicon

مقدار `lexicon: Lexicon` نمونه داده همراه بسته است. نوع `Lexicon` از ماژول اصلی صادر می‌شود و شامل `terms: Map<string, string>` و `verb(word: string, keepNegation: boolean): string | undefined` است.

تابع `createLexicon(verbs: string, keep: string, plurals: string, lemmas = ""): Lexicon` همین ساختار را می‌سازد. ورودی‌ها به ترتیب جفت‌های `past#present`، واژه‌های محافظت‌شده و جفت‌های `plural>singular` هستند که با فاصله جدا می‌شوند. رشته اختیاری lemma قالب فشرده و تولیدشده ویرایش است: سرآیند برچسب‌های `verb/prefix/cut/append` جداشده با نقطه‌ویرگول لاتین و سپس خط‌های `labelIndex:word,word`. این تابع خواننده عمومی فایل فرهنگ لغت نیست و داده بدقالب را اعتبارسنجی نمی‌کند.

برای داده سفارشی، کلیدهای یکسان‌شده بدون نیم‌فاصله بدهید و برخوردها را بررسی کنید. map همراه بسته، `get` را برای مراجعه به اصلاح‌های lemma بازنویسی می‌کند؛ `has`، پیمایش و `size` فهرست دوم را نشان نمی‌دهند. پس از ذخیره نتیجه در تحلیلگر، نمونه مشترک واژه‌نامه را تغییر ندهید؛ واژه‌نامه و تحلیلگر تازه بسازید.

## fa-search-kit/analytics

```js
import { createAnalyzer } from "fa-search-kit";
import { canonicalKey, KEY_VERSION } from "fa-search-kit/analytics";
const analyzer = createAnalyzer();
console.log(JSON.stringify(KEY_VERSION)); // => "1"
console.log(JSON.stringify(canonicalKey("كتاب کتابها", { analyzer, prefix: "site-v1" }))); // => "site-v1:کتاب"
```

تابع `canonicalKey(query, { analyzer?, prefix? } = {}): string` عبارت‌های حالت جستجو را بی‌تکرار و مرتب می‌کند و پس از پیشوند نسخه به هم می‌پیوندد. پیش‌فرض آن تحلیلگر استاندارد و خروجی `KEY_VERSION` است که اکنون `"1"` است. این کلید مجموعه عبارت برابر را گروه‌بندی می‌کند، نه معنای برابر؛ ترتیب و تکرار از دست می‌رود. ابزار ناشناس‌سازی نیست. عبارت واقعا جستجوشده، یعنی `result.query` در اصلاح جستجو، تحلیلگر سایت و با تغییر تنظیمات پیشوند تازه را به کار ببرید.

## fa-search-kit/package.json

این خروجی عمومی فراداده، نسخه اعلام‌شده و نقشه خروجی‌های بسته را در اختیار می‌گذارد. ورودی تحلیلگر نیست. نگارش import فایل JSON به محیط اجرا یا ابزار ساخت بستگی دارد.
