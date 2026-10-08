---
title: "اتصال موتورهای جستجوی سمت کاربر"
description: "MiniSearch، Orama، FlexSearch و Lunr را از مسیرهای پشتیبانی‌شده رابط‌ها متصل کنید."
---

# اتصال موتورهای جستجوی سمت کاربر

هر نمونه مستقل است و از پروفایل استاندارد استفاده می‌کند. بسته را از سورس و نسخه موتور را مطابق [راهنمای نصب](../installation.md) نصب کنید. نمونه‌ها را به صورت ESM در Node اجرا کنید یا برای مرورگر بسته‌بندی کنید. رابط‌ها UI فراهم نمی‌کنند و رتبه‌بندی موتور را جایگزین نمی‌کنند.

## MiniSearch

```js
import MiniSearch from "minisearch";
import { faMiniSearch } from "fa-search-kit/minisearch";
const fa = faMiniSearch();
const index = new MiniSearch({
  fields: ["title"], storeFields: ["title"], ...fa,
  searchOptions: { ...fa.searchOptions, boost: { title: 2 } },
});
index.addAll([
  { id: "books", title: "كتابهاي قديمي" },
  { id: "car", title: "ماشین قرمز" },
]);
console.log(JSON.stringify(index.search("کتاب").map(({ id, title }) => ({ id, title })))); // => [{"id":"books","title":"كتابهاي قديمي"}]
```

رابط، `tokenize` نمایه، تابع بدون تغییر `processTerm` و نسخه‌های مخصوص جستجو را در `searchOptions` فراهم می‌کند. هنگام افزودن وزن، پیشوند یا تطبیق تقریبی، این شیء را ادغام کنید. جایگزین کردن آن، پردازش حالت جستجو را از بین می‌برد. `autoSuggest` نیز همین گزینه‌ها را به کار می‌برد.

تطبیق پیش‌فرض همان OR در MiniSearch است. برای AND و پیش‌فرض lemma در پروفایل کامل، از `faMiniSearch({ combineWith: "AND", lexicon })` استفاده کنید. ابتدا `lexicon` را از `fa-search-kit/lexicon` وارد کنید. اگر بعدا combineWith را تغییر دادید، حالت فعل را آگاهانه انتخاب کنید و در صورت تغییر عبارت‌ها نمایه را دوباره بسازید. تطبیق تقریبی و جستجوی پیشوندی قابلیت موتور هستند؛ اثر رتبه‌بندی آنها را جدا از اصلاح جستجو ارزیابی کنید.

## Orama

```js
import { create, insertMultiple, search } from "@orama/orama";
import { faTokenizer } from "fa-search-kit/orama";
const db = create({
  schema: { title: "string" },
  components: { tokenizer: faTokenizer() },
});
await insertMultiple(db, [{ id: "books", title: "كتابهاي قديمي" }]);
console.log(JSON.stringify((await search(db, { term: "کتاب" })).hits.map(h => h.id))); // => ["books"]
```

همراه توکن‌ساز سفارشی، گزینه `language` را به `create` ندهید. Orama هنگام نمایه‌سازی نام ویژگی را می‌دهد و هنگام جستجو آن را نمی‌دهد؛ رابط با همین تفاوت حالت را انتخاب می‌کند.

مقدار پیش‌فرض `exactTerms: true` است: به انتهای هر عبارت `_` اضافه می‌شود تا جستجوی پیشوندی معمول، واژه بلندتر را تطبیق ندهد. برای حفظ تطبیق پیشوندی، `exactTerms: false` بگذارید و نمایه را دوباره بسازید. این گزینه با `exact: true` خود Orama فرق دارد؛ در نسخه آزموده‌شده 3.1.18، آن گزینه از آزمون مرز واژه نامناسب برای فارسی استفاده می‌کند. تحمل غلط تایپی موتور جداست و این رابط آن را فعال نمی‌کند. پیش‌فرض فعل در پروفایل کامل stem است.

## FlexSearch

```js
import FlexSearch from "flexsearch";
import { faDocument, faEncode } from "fa-search-kit/flexsearch";
const options = { document: { id: "id", index: ["title"] } };
const index = faDocument(FlexSearch, options);
index.add({ id: "books", title: "کتاب‌خانه" });
console.log(JSON.stringify(index.search("کتاب خانه", { merge: true }).map(h => h.id))); // => ["books"]
const simple = new FlexSearch.Document({ ...options, encode: faEncode() });
simple.add({ id: "books", title: "کتاب‌خانه" });
console.log(JSON.stringify(simple.search("کتاب خانه", { merge: true }))); // => []
```

تابع `faDocument` نوشتن هم‌زمان با `add`، `append` و `update` را در حالت نمایه اجرا می‌کند و سپس حالت جستجو را برمی‌گرداند. هر `encode` یا `encoder` در گزینه‌های Document را جایگزین می‌کند. سایر گزینه‌ها، از جمله فیلدهای ذخیره‌شده، در اختیار شما می‌مانند.

این رابط را با worker یا نوشتن از روش‌های `*Async` ترکیب نکنید؛ ممکن است پردازش پس از بازگشت حالت موقت اجرا شود. تابع ساده `faEncode` در هر دو طرف از حالت جستجو استفاده می‌کند؛ بنابراین بخش‌های ترکیب، عبارت‌های جایگزین نیم‌فاصله یا شکل بدون کلاه را به نمایه اضافه نمی‌کند. این مسیر عمدا قابلیت محدودتری دارد. پیش‌فرض فعل در پروفایل کامل lemma است.

## Lunr

```js
import lunr from "lunr";
import { faLunr } from "fa-search-kit/lunr";
const fa = faLunr(lunr);
const index = lunr(function () {
  this.use(fa);
  this.ref("id");
  this.field("title");
  this.add({ id: "books", title: "كتابهاي قديمي" });
});
console.log(JSON.stringify(fa.search(index, "کتاب").map(h => h.ref))); // => ["books"]
```

افزونه هر دو زنجیره پردازش انگلیسی را پاک می‌کند و توکن‌ساز سازنده را جایگزین می‌کند. با `fa.search(index, query)` جستجو کنید؛ `index.search()` از پردازشگر عبارت خود Lunr استفاده می‌کند و توکن‌ساز رابط را دور می‌زند.

تابع کمکی عبارت‌ها را با `usePipeline: false` اضافه می‌کند و تطبیق هر یک از آنها کافی است. نویسه‌های دستور Lunr مانند `:`، `~`، `^`، `+`، `-` و `*` ورودی متنی یا جداکننده هستند، نه عملگر. جستجوی پیشرفته در فیلد یا شرط‌های اجباری و ممنوع به اتصال آگاهانه شما با API عبارت Lunr نیاز دارد. افزونه فراداده ترتیب توکن را می‌دهد، نه موقعیت نویسه در متن اصلی. پیش‌فرض فعل در پروفایل کامل stem است.

[تنظیمات مشترک](../indexing.md)، [برجسته‌سازی](../text-analysis.md) و [امضاهای رابط‌ها](../api/adapters.md) را ببینید.
