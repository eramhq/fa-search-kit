---
title: "API رابط‌های جستجو"
description: "تابع‌های اتصال موتور، گزینه‌های ساخت Pagefind و روش‌های پردازش نتیجه مرورگر را پیدا کنید."
---

# API رابط‌های جستجو

برای راه‌اندازی اجرایی، [اتصال Pagefind](../guides/pagefind.md) یا [نمونه موتورهای سمت کاربر](../guides/client-engines.md) را بخوانید. این صفحه ماژول‌های عمومی و تابع‌های اتصال آنها را فهرست می‌کند.

## گزینه‌های مشترک

رابط‌ها گزینه‌های تحلیلگر به‌علاوه `analyzer?: Analyzer` را می‌پذیرند. تحلیلگر آماده بدون تغییر استفاده می‌شود و سایر تنظیمات پردازش نادیده گرفته می‌شوند. در غیر این صورت، واژه‌نامه full را انتخاب می‌کند مگر پروفایل صریح باشد. گزینه مخصوص رابط، مانند `exactTerms` در Orama، همچنان اعمال می‌شود. خود `AdapterOptions` داخلی است و از مسیر عمومی صادر نمی‌شود؛ نوع گزینه رابط مشخص را، اگر صادر شده، وارد کنید یا برای تنظیمات مشترک از `AnalyzerOptions` ماژول اصلی استفاده کنید.

## fa-search-kit/pagefind

تابع `faPagefind(options = {}): PagefindAdapter` پیش‌فرض فعل full را lemma می‌گذارد و این روش‌ها را می‌دهد:

- `processQuery(query: string): string`: عبارت‌های بی‌تکرار جستجو با فاصله به هم پیوسته؛ عبارت را به خاطر نمی‌سپارد.
- `processTerm(term: string): string`: همان پردازش، همراه نگهداری عبارت برای پردازش نتیجه UI.
- `processResult<R extends PagefindResultData>(result: R, query?: string): R`: چکیده و عنوان را تغییر می‌دهد و همان شیء را برمی‌گرداند. بدون query، آخرین ورودی `processTerm` استفاده می‌شود.
- `excerpt(content: string, query: string, words = 30): string`: HTML با متن escape‌شده و عنصر mark پیرامون تطبیق پیشوندی در پنجره توکن‌ها. تعداد واژه مثبت بدهید. ورودی محتوای متنی است؛ تابع پاک‌سازی یا پردازش عمومی HTML نیست.

نوع `PagefindResultData` شامل `content`، `excerpt`، فیلد اختیاری `meta: Record<string, string>` و `sub_results: { excerpt: string }[]` اختیاری است. ماژول این نوع، `PagefindAdapter` و ثابت‌های مرز بلوک پنهان `OPEN` یعنی `⁅` و `CLOSE` یعنی `⁆` را صادر می‌کند. این نشانگرها را در محتوای معمول صفحه به کار نبرید.

## fa-search-kit/pagefind/build

تابع `faPagefindIndex(options?: PagefindIndexOptions): PagefindIndexAdapter` روش‌های `annotateHtml(html, { words?: boolean } = {}): string` و `addPages(index: PagefindIndex, pages: Iterable<{ url?: string; sourcePath?: string; content: string }>): Promise<string[]>` را می‌دهد. آماده‌سازی HTML تازه برمی‌گرداند؛ CLI آن را در محل می‌نویسد. گزینه `words: false` فقط گردآوری واژه آن صفحه را متوقف می‌کند، نه آماده‌سازی را. `addPages` رشته‌های خطای Pagefind را برمی‌گرداند؛ آنها را بررسی کنید.

نوع `PagefindIndex` به روش ناهم‌زمان `addHTMLFile({ url?, sourcePath?, content })` با خروجی `{ errors: string[] }` نیاز دارد. ماژول ساخت، نوع‌های `PagefindIndex`، `PagefindIndexAdapter` و `PagefindIndexOptions` و همچنین `BODY`، عبارت منظم تشخیص نشانگر body، را صادر می‌کند.

گزینه‌های افزوده ساخت:

- `terms: "all" | "new" | "prefix"` با پیش‌فرض all: همه عبارت‌ها را نگه می‌دارد، عبارت‌های از قبل موجود در واژه‌های Pagefind را کنار می‌گذارد یا پیشوندهای عبارت بلندتر موجود را هم حذف می‌کند. این انتخاب بر امتیاز طول صفحه و شواهد تطبیق اثر دارد.
- `weight?: number`: وزن بلوک عبارت بدنه؛ عبارت‌های عنوان وزن عنوان یا وزن به‌ارث‌رسیده را حفظ می‌کنند. مقدار مثبت بدهید.
- `title: "keep" | "fold" | "terms"` با پیش‌فرض terms: فراداده عنوان را حفظ، یکسان‌سازی یا تحلیل می‌کند. fold و terms عنوان نمایشی را در `fa_title` نگه می‌دارند؛ فراداده عنوان صریح دست‌نخورده می‌ماند.
- `surface?: boolean` با پیش‌فرض true: شکل ظاهری یکسان‌شده‌ای را که Pagefind متفاوت می‌خواند اضافه می‌کند.
- `words?: { add(text: string): void }`: متن قابل جستجو را پیش از افزودن عبارت‌های پنهان دریافت می‌کند.

دستور `fa-search-kit-pagefind <site-dir>` گزینه‌های `--profile light|standard|full`، `--verbs lemma|stem`، `--words`، `--words-dir <dir>` و `--help` یا `-h` را می‌پذیرد. فایل‌های `.html` و `.htm` را بازگشتی آماده می‌کند. پروفایل پیش‌فرض standard است و تنظیم مرورگر باید با آن یکسان باشد. فقط مقدارهای مستند فعل را بدهید؛ CLI رشته دلخواه فعل را اعتبارسنجی نمی‌کند.

## fa-search-kit/orama

تابع `faTokenizer(options?: OramaTokenizerOptions): OramaTokenizer` گزینه افزوده `exactTerms?: boolean` با پیش‌فرض true دارد. خروجی شامل `language: string`، `normalizationCache: Map<string, string>` و `tokenize(raw, language?, prop?, withCache?): string[]` است. وقتی `prop === undefined` باشد حالت جستجو و در غیر این صورت نمایه انتخاب می‌شود؛ آرگومان‌های دیگر فراخوانی توکن‌ساز نادیده گرفته می‌شوند. هر دو نوع نام‌برده صادر می‌شوند. پیش‌فرض فعل full برابر stem است.

## fa-search-kit/minisearch

تابع `faMiniSearch(options?: MiniSearchAdapterOptions): MiniSearchAdapter` گزینه افزوده `combineWith?: "OR" | "AND"` دارد. روش `tokenize(text)` سند را تحلیل می‌کند و `processTerm(term)` ورودی را بدون تغییر می‌دهد. شیء `searchOptions` شامل `tokenize` جستجو، `processTerm` بدون تغییر و `combineWith` اختیاری است. هر دو نوع نام‌برده صادر می‌شوند. پیش‌فرض فعل full فقط با AND برابر lemma و در بقیه حالت‌ها stem است.

## fa-search-kit/flexsearch

تابع `faEncode(options = {}): (text: string) => string[]` در هر دو طرف از حالت جستجو استفاده می‌کند. تابع `faDocument<D>(FlexSearch: { Document: new (options: never) => D }, options: object, fa = {}): D` یک Document با نوشتن هم‌زمان پوشش‌داده‌شده برمی‌گرداند. encoderها را جایگزین می‌کند؛ worker و نوشتن ناهم‌زمان پشتیبانی نمی‌شوند. نوع مستقل گزینه یا نتیجه در این ماژول صادر نشده است. پیش‌فرض فعل full برابر lemma است.

## fa-search-kit/lunr

تابع `faLunr(lunr: LunrModule, options = {}): LunrPlugin` افزونه سازنده و روش `search<R>(index, query: string): R[]` را برمی‌گرداند. برای عبارت پردازش‌شده خالی، آرایه خالی می‌دهد. نوع `LunrModule` سازنده `Token` ورودی و `LunrPlugin` افزونه و روش جستجو را توصیف می‌کند. هر دو صادر می‌شوند. پیش‌فرض فعل full برابر stem است. تابع کمکی عملگرهای جستجو را تفسیر نمی‌کند.

## اصلاح اختیاری

مسیر `fa-search-kit/pagefind/rescue` در [مرجع اصلاح جستجو](rescue.md) آمده است. این بخش از آماده‌سازی مرحله ساخت و پردازش معمول عبارت جداست.
