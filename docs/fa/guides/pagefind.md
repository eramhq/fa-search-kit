---
title: "اتصال به Pagefind"
description: "صفحه‌های فارسی را پیش از نمایه‌سازی آماده کنید و عبارت‌ها و چکیده‌ها را در مرورگر پردازش کنید."
---

# اتصال به Pagefind

Pagefind به رابط مرحله ساخت و رابط مرورگر نیاز دارد. ابتدا [نصب از سورس](../installation.md) را انجام دهید، HTML سایت را در `dist` بسازید و زبان HTML صفحه‌های فارسی را `fa` قرار دهید.

## آماده‌سازی خروجی سایت

```sh
npm install pagefind@1.5.2
npx --no-install fa-search-kit-pagefind dist --profile full --verbs lemma
npx --no-install pagefind --site dist
```

نخستین دستور پس از نصب، HTML ساخته‌شده را در همان محل تغییر می‌دهد. عبارت‌های پردازش‌شده پنهان و به صورت پیش‌فرض فراداده عنوان قابل جستجو را اضافه می‌کند و عنوان اصلی را نگه می‌دارد. آن را پس از تولید HTML و پیش از Pagefind اجرا کنید. اجرای دوباره بلوک‌های تولیدشده قبلی را جایگزین می‌کند. این دستور را روی فایل‌های تالیف محتوا اجرا نکنید.

پروفایل پیش‌فرض CLI استاندارد است؛ `--profile full` واژه‌نامه را خودکار بارگذاری می‌کند. گزینه `--verbs lemma` تنظیم فعل را صریح مشخص می‌کند. در مرورگر همان گزینه‌ها را به کار ببرید. زبان را به عربی تغییر ندهید؛ بن‌یاب دوم ممکن است عبارت‌های آماده‌شده را تغییر دهد.

بخش قابل جستجو را با `data-pagefind-body` و محتوای کنارگذاشته‌شده را با `data-pagefind-ignore` مشخص کنید. اگر حتی یک صفحه نشانگر body داشته باشد، Pagefind صفحه‌های بدون آن را کنار می‌گذارد. گردآوری واژه‌ها نیز از همین قاعده پیروی می‌کند. در پردازش معمول صفحه کامل، منو، پابرگ، اسکریپت، فرم و عناصر مستثناشده دیگر وارد نمی‌شوند. پردازشگر HTML رابط سبک است؛ از سند کامل و ساختار درست استفاده کنید و نشانه‌گذاری نامعمول را بررسی کنید.

### مسیر جایگزین با Node

به‌جای بازنویسی فایل‌های سایت می‌توانید از این روش استفاده کنید. `addPages` پیش از تحویل محتوا به Pagefind، عبارت‌ها را اضافه می‌کند و رشته‌های خطای آن را برمی‌گرداند. نمونه فایل‌ها را در حافظه می‌سازد؛ برای ذخیره در ساخت سایت، خط `writeFiles` را از حالت توضیح خارج کنید.

```js
import * as pagefind from "pagefind";
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefindIndex } from "fa-search-kit/pagefind/build";
const { index, errors } = await pagefind.createIndex({ forceLanguage: "fa" });
if (!index || errors.length) throw new Error(errors.join("\n"));
try {
  const fa = faPagefindIndex({ profile: "full", lexicon, verbs: "lemma" });
  const failures = await fa.addPages(index, [{
    url: "/books/",
    content: '<html lang="fa"><body><main data-pagefind-body><h1>كتابهاي قديمي</h1></main></body></html>',
  }]);
  if (failures.length) throw new Error(failures.join("\n"));
  const { files } = await index.getFiles();
  console.log(JSON.stringify(files.length > 0)); // => true
  // For your site build: await index.writeFiles({ outputPath: "dist/pagefind" });
} finally {
  await pagefind.close();
}
```

## جستجو در مرورگر

importهای زیر را بسته‌بندی کنید. پوشه تولیدشده Pagefind را از HTTP ارائه دهید و `bundleUrl` را با مسیر پایه استقرار هماهنگ کنید؛ نشانی نسبی نمونه فرض می‌کند پوشه کنار صفحه فعلی است.

```js browser
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefind } from "fa-search-kit/pagefind";
const fa = faPagefind({ profile: "full", lexicon, verbs: "lemma" });
const bundleUrl = new URL("./pagefind/pagefind.js", document.baseURI).href;
const pagefind = await import(/* @vite-ignore */ bundleUrl);
const query = "کتاب";
const response = await pagefind.search(fa.processQuery(query));
const results = await Promise.all(response.results.slice(0, 10).map(async hit =>
  fa.processResult(await hit.data(), query)
));
console.log(results);
```

پیش از نمایش نتیجه آماده‌شده، همیشه `processResult` را فراخوانی کنید. این تابع شیء نتیجه را تغییر می‌دهد و همان را برمی‌گرداند، چکیده اصلی را از متن قابل نمایش بازسازی می‌کند، نشانگرهای پنهان را از چکیده نتیجه‌های فرعی حذف می‌کند و عنوان اصلی را از `meta.fa_title` برمی‌گرداند. در API جاوااسکریپت، به‌ویژه هنگام جستجوهای هم‌زمان، عبارت خام را صریح بدهید. پاسخ قدیمی را در رابط کاربری نادیده بگیرید.

### مسیر جایگزین با Pagefind UI

پیش از اجرای این کد بسته‌بندی‌شده، فایل تولیدشده `pagefind-ui.js` و شیوه‌نامه آن را بارگذاری کنید و محفظه `#search` را بسازید. `PagefindUI` در این نمونه متغیر عمومی همان اسکریپت است.

```js browser
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefind } from "fa-search-kit/pagefind";
const fa = faPagefind({ profile: "full", lexicon, verbs: "lemma" });
new PagefindUI({
  element: "#search",
  bundlePath: new URL("./pagefind/", document.baseURI).href,
  processTerm: fa.processTerm,
  processResult: fa.processResult,
});
```

تابع `processTerm` عبارت را برای `processResult` نگه می‌دارد. برای هر رابط جستجوی مستقل، نمونه جداگانه‌ای از رابط کتابخانه بسازید. رفتار چکیده و اشکال فعلی موقعیت نویسه‌های خارج از محدوده پایه یونیکد در [راهنمای پردازش متن](../text-analysis.md) آمده است.

## واژه‌ها و اصلاح اختیاری

گزینه `--words` را به مرحله آماده‌سازی اضافه کنید تا `dist/fa-words/` ساخته شود. گزینه `--words-dir` مسیر دیگری تعیین می‌کند و خودش نیز ساخت واژه‌ها را فعال می‌کند. سپس [اصلاح جستجو](../query-rescue.md) را صریح متصل کنید. ساخت فهرست واژه‌ها به‌تنهایی اصلاح را فعال نمی‌کند. مستندات فارسی ارم از تنظیم full/lemma بالا بدون اصلاح جستجو استفاده می‌کنند.

گزینه‌های ساخت `terms`، `weight`، `title` و `surface` در [مرجع رابط‌ها](../api/adapters.md) توضیح داده شده‌اند.
