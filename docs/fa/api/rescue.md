---
title: "API اصلاح جستجو و صفحه‌کلید"
description: "نتیجه اصلاح، منبع واژه‌ها، نامزد صفحه‌کلید و رابط اصلاح Pagefind UI را بشناسید."
---

# API اصلاح جستجو و صفحه‌کلید

برای مسیر کامل جستجو و پیام کاربر، [اصلاح جستجو](../query-rescue.md) را ببینید. ماژول‌های زیر خروجی‌های عمومی مستقل هستند.

## fa-search-kit/rescue

تابع `createRescue(options: RescueOptions): Rescue` به `analyzer: Analyzer` نیاز دارد. گزینه `words: WordSource` قطعه‌های نامزد را می‌دهد و `isKnown(word): boolean | Promise<boolean>` متن خام واژه را در نمایه بررسی می‌کند. بدون `words`، تابع `addText` نامزدها را جمع می‌کند؛ بدون `isKnown`، عبارت‌های جستجو با عبارت‌های نمایه جمع‌شده بررسی می‌شوند.

روش‌های `Rescue`:

- `addText(text: string): void`: عبارت‌ها و در نبود منبع بیرونی، واژه‌ها را اضافه می‌کند. حذف یا پاک‌سازی حافظه نهان ندارد.
- `check(query: string, found: number): Promise<Fix | undefined>`: با توجه به تعداد نتیجه عبارت اصلی، یک بازنویسی پیشنهاد می‌کند. نامزد نهایی را جستجو نمی‌کند.
- `rescueSearch<R>(search: (query: string) => R[] | Promise<R[]>, query: string): Promise<RescueResult<R>>`: متن اصلی را جستجو و بررسی می‌کند و برای تایید اصلاح، نامزد را هم جستجو می‌کند. خطاهای جستجو به فراخوان منتقل می‌شوند.

نوع `RescueResult<R>` شامل `results: R[]`، `query: string` یعنی عبارت واقعی آن نتیجه‌ها و `fix: Fix` اختیاری است. نوع `Fix` شامل `from`، `to`، `pieces: string[]` یعنی کلید قطعه‌های استفاده‌شده و `auto: boolean` است. false یعنی پیشنهاد همراه نتیجه اصلی؛ true یعنی نتیجه برای اصلاح. مسیر موفق فقط صفحه‌کلید ممکن است هیچ قطعه املایی مصرف نکند.

تابع `fetchWords(dir: string | URL, fetcher?: typeof fetch): FetchedWords` یک `WordSource` با بارگذاری هنگام نیاز و `bytes: number` فقط‌خواندنی می‌دهد. روش `WordSource.piece(key)` مقدار `Piece | undefined` را مستقیم یا در promise می‌دهد. نوع `Piece` برابر `Map<string, Word>` و `Word` برابر `[spelling: string, count: number]` است. کلیدها شناسه داخلی قطعه واژه هستند، نه عبارت جستجو؛ معمولا اجازه دهید خود اصلاح‌گر آنها را درخواست کند.

نوع‌های صادرشده `RescueOptions`، `Fix`، `RescueResult`، `Rescue`، `FetchedWords`، `Piece`، `Word` و `WordSource` هستند. `WordList`، `wordKey`، `pieceKey`، اصلاح‌گر املایی و تابع فاصله ویرایش از این ماژول خروجی عمومی ندارند.

## fa-search-kit/rescue/build

تابع `createWordList(options?: WordListOptions): WordListBuilder` تحلیلگر اختیاری با پیش‌فرض standard می‌گیرد. از توکن استفاده می‌کند، نه بن؛ بنابراین تنظیم یکسان‌سازی و اتصال مهم است اما حالت فعل، توکن جمع‌شده را تغییر نمی‌دهد.

نوع `WordListBuilder` شامل `add(text): void`، مقدار فقط‌خواندنی `list`، روش `files(): Map<string, Uint8Array>` و `write(dir: string): number` است. شیء `list` فهرست گردآوری‌شده با `add(token)` برای توکن از قبل یکسان‌شده، `piece(key)` و `pieces` است؛ برای متن معمولی از `add(text)` خود سازنده استفاده کنید. `files()` بدون نوشتن، `index.json` و قطعه‌های gzip‌شده با نام هش‌دار را می‌دهد. `write()` پوشه را می‌سازد، فایل فهرست و قطعه‌های تولیدشده قبلی را حذف و نسخه جدید را می‌نویسد و تعداد بایت را برمی‌گرداند. پوشه مخصوص خروجی تولیدشده بدهید. نوع‌های `WordListOptions` و `WordListBuilder` صادر می‌شوند؛ ماژول به Node نیاز دارد.

## fa-search-kit/keyboard

```js
import { keyboardCandidates } from "fa-search-kit/keyboard";
console.log(JSON.stringify(keyboardCandidates("nd[d"))); // => ["دیجی","ریجی"]
console.log(JSON.stringify(keyboardCandidates("سشپسعدل"))); // => ["samsung"]
```

تابع `keyboardCandidates(run: string): string[]` همه چینش‌های پشتیبانی‌شده را می‌آزماید و نامزدهای یکتا بدون خود ورودی را می‌دهد. رشته خام بدون فاصله بدهید تا کلیدهای همراه Shift حفظ شوند. نامزد، اصلاح تاییدشده نیست؛ نمایه را بررسی کنید یا از rescue استفاده کنید.

مقدار `LAYOUTS: Record<string, string>` شامل `isiri9147`، `win-legacy` و `mac-legacy` است. تابع `toPersian(text, layout)` کلیدهای US را به چینش داده‌شده و `toLatin(text, layout)` آنها را برعکس نگاشت می‌کند؛ نویسه بدون نگاشت عبور می‌کند. `layoutCandidates(run, layout)` فیلترهای قابل قبول بودن را برای یک چینش اعمال می‌کند. رشته چینش از `LAYOUTS` را بدهید، نه نام آن را. `LETTERS` عبارت منظم global برای حروف پشتیبانی‌شده فارسی و عربی است؛ در استفاده تکراری از روش‌های حالت‌دار regex، مقدار `lastIndex` را بازنشانی کنید.

## fa-search-kit/pagefind/rescue

تابع `pagefindKnows(pagefind: PagefindSearch | Promise<PagefindSearch>, fa: PagefindAdapter): (word: string) => Promise<boolean>` محتوای نخستین نتیجه را بررسی می‌کند. عبارت فارسی می‌تواند پیشوند باشد؛ حرف یا رقم ASCII باید با کل واژه تطبیق داشته باشد. نوع `PagefindSearch` به `search(term)` ناهم‌زمان با نتیجه‌های دارای `data()` ناهم‌زمان و محتوای `content` نیاز دارد.

تابع `rescuePagefindUI(options: PagefindRescueOptions): PagefindRescueUI` گزینه‌های مشترک تحلیلگر و فیلدهای اجباری `fa` و `bundlePath` را می‌گیرد. مقدار اختیاری `wordsPath` به صورت پیش‌فرض `fa-words/` کنار پوشه بسته است؛ `onNotice` اختیاری مقدار `PagefindNotice | undefined` می‌گیرد.

خروجی شامل `processTerm(term): string`، `attach(ui: { triggerSearch(term): void }): void`، مقدار فقط‌خواندنی `rescue` و `words: FetchedWords` است. پس از ساخت UI، attach را فراخوانی کنید. رابط، خطاهای ناهم‌زمان اصلاح را در کنسول ثبت می‌کند. جستجوی معمول عبارت اصلی همچنان می‌تواند ادامه یابد.

نوع `PagefindNotice` شامل `from`، `to`، `fixed: boolean` و `other(): void` است. undefined پیام را پاک می‌کند. با fixed برابر true، عمل مربوط عبارت اصلی را جستجو می‌کند و انتخاب را نگه می‌دارد؛ در غیر این صورت پیشنهاد را جستجو می‌کند. ماژول چهار نوع `PagefindSearch`، `PagefindRescueOptions`، `PagefindRescueUI` و `PagefindNotice` و دو تابع زمان اجرای خود را صادر می‌کند. `PagefindAdapter` را از `/pagefind` وارد کنید؛ اینجا دوباره صادر نشده است.
