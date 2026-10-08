---
title: "پیشنهاد اصلاح اختیاری جستجو"
description: "واژه‌های سایت را گردآوری کنید و اصلاح خودکار را از پیشنهاد جدا نگه دارید."
---

# پیشنهاد اصلاح اختیاری جستجو

اصلاح جستجو لایه‌ای اختیاری بالای پردازش معمول است. ابتدا نامزدهای چینش صفحه‌کلید را می‌آزماید و سپس شکل‌های نزدیک املایی فارسی را از محتوای خود شما انتخاب می‌کند. غلط‌گیر عمومی نیست و قصد کاربر را تضمین نمی‌کند.

## گردآوری واژه‌ها هنگام نمایه‌سازی

این نمونه اجرایی از OR پیش‌فرض MiniSearch و تحلیلگر یکسان برای نمایه‌سازی، جستجو و اصلاح استفاده می‌کند.

```js
import MiniSearch from "minisearch";
import { createAnalyzer } from "fa-search-kit";
import { faMiniSearch } from "fa-search-kit/minisearch";
import { createRescue } from "fa-search-kit/rescue";
const analyzer = createAnalyzer();
const index = new MiniSearch({ fields: ["title"], ...faMiniSearch({ analyzer }) });
const rescue = createRescue({ analyzer });
for (const doc of [
  { id: "shop", title: "دیجی کالا" },
  { id: "soap", title: "صابون طبیعی" },
]) {
  index.add(doc);
  rescue.addText(doc.title);
}
for (const input of ["nd[d", "سابون", "سابون طبیعی"]) {
  const result = await rescue.rescueSearch(q => index.search(q), input);
  console.log(JSON.stringify([result.query, result.fix?.to, result.fix?.auto]));
}
// => ["دیجی","دیجی",true]
// => ["صابون","صابون",true]
// => ["سابون طبیعی","صابون طبیعی",false]
```

عبارت `nd[d` با تبدیل چینش به «دیجی» می‌رسد. «سابون» به همان صورت نتیجه‌ای ندارد، پس «صابون» خودکار جستجو می‌شود. «سابون طبیعی» از طریق «طبیعی» سند صابون را پیدا می‌کند؛ بنابراین نتیجه‌های عبارت اصلی حفظ می‌شوند و «صابون طبیعی» فقط پیشنهاد است. این خروجی‌ها به همین واژه‌ها و تنظیمات موتور وابسته‌اند.

تابع `addText` عبارت‌های نمایه را برای تشخیص واژه شناخته‌شده و شکل یکسان‌شده واژه‌ها را برای نامزدهای املایی جمع می‌کند. آن را برای محتوای واقعا قابل جستجو فراخوانی کنید. بسته هیچ فهرستی از واژه‌های سایت همراه ندارد.

## تصمیم اصلاح را به کاربر نشان دهید

جستجو وقتی ضعیف در نظر گرفته می‌شود که نتیجه نداشته باشد یا واژه‌ای از عبارت ناشناخته باشد. اصلاحی که فقط مربوط به صفحه‌کلید است، حتی با وجود نتیجه قبلی می‌تواند خودکار باشد. اصلاح املایی وقتی عبارت اصلی نتیجه ندارد خودکار است؛ در غیر این صورت پیشنهاد می‌شود. اصلاح ترکیبی صفحه‌کلید و املا با وجود نتیجه قبلی، پیشنهاد باقی می‌ماند.

تابع `rescueSearch` ابتدا عبارت اصلی را جستجو می‌کند و `{ results, query, fix? }` می‌دهد. اصلاح فقط وقتی حفظ می‌شود که عبارت اصلاح‌شده هم نتیجه داشته باشد. `check(query, found)` به‌تنهایی این بررسی نهایی را انجام نمی‌دهد؛ فراخوان باید آن را انجام دهد.

وقتی `fix.auto` برابر true است، اعلام کنید که نتیجه‌ها برای `fix.to` هستند و گزینه «جستجو به همان صورت» بدهید. این عمل باید جستجوی مستقیم موتور را با `fix.from` و بدون عبور از اصلاح اجرا کند؛ وگرنه همان اصلاح تکرار می‌شود. وقتی false است، نتیجه‌های اصلی را نگه دارید و انتخاب پیشنهاد را به کاربر بسپارید. عبارت کاربر را با گره متنی نمایش دهید، نه HTML درون‌یابی‌شده. در رابط ناهم‌زمان، پاسخ عبارت قدیمی را کنار بگذارید.

## ساخت و بارگذاری واژه‌ها

```js
import { createWordList } from "fa-search-kit/rescue/build";
const words = createWordList();
words.add("صابون طبیعی دیجی کالا");
console.log(JSON.stringify(words.files().has("index.json"))); // => true
// In your build: words.write("dist/fa-words");
```

برای Pagefind، مقدار `words: createWordList({ analyzer })` را به `faPagefindIndex` بدهید و پس از افزودن همه صفحه‌ها فهرست را بنویسید. گزینه `--words` در CLI همین کار را انجام می‌دهد. قطعه‌ها واژه‌های فارسی حداقل سه‌حرفی را بر اساس گروه حرف اول و طول نگه می‌دارند. تعدادها رو به پایین به توان دو گرد می‌شوند و سقف آنها 512 است. نام فایل‌ها هش محتوا دارد؛ `write()` فایل فهرست و قطعه‌های تولیدشده قبلی را در پوشه مقصد جایگزین می‌کند.

در مرورگر، `fetchWords(url)` فهرست و فقط قطعه‌های لازم برای اصلاح املایی جستجوی ضعیف را دریافت می‌کند. ساخت این شیء به‌تنهایی درخواست شبکه نمی‌فرستد. در Node نشانی مطلق بدهید؛ نشانی نسبی مرورگر نسبت به صفحه فعلی محاسبه می‌شود. فهرست و قطعه‌ها را با هم ارائه دهید، بازاعتبارسنجی فهرست را مجاز بگذارید و بایت‌های gzip‌شده را دوباره gzip نکنید.

منبع واژه راه‌دور، نامزد می‌دهد و شناخته‌شدن عبارت در نمایه را ثابت نمی‌کند. `isKnown` بدهید یا همچنان عبارت‌های نمایه را با `addText` جمع کنید. برای Pagefind از `pagefindKnows(pagefind, fa)` استفاده کنید؛ تعداد نتیجه به‌تنهایی ممکن است تطبیق پیشوندی یا جایگزین را واژه شناخته‌شده فرض کند. این تابع فقط قطعه نخستین نتیجه را بررسی می‌کند و همچنان روشی تقریبی است.

## اتصال به Pagefind UI

ابتدا [راهنمای Pagefind](guides/pagefind.md) را انجام دهید، با `--words` بسازید، اسکریپت و شیوه‌نامه UI را بارگذاری کنید و محفظه‌های `#search` و `#search-notice` را قرار دهید. پیام‌های این نمونه فارسی هستند؛ آنها را با زبان مخاطب هماهنگ کنید.

```js browser
import { createAnalyzer } from "fa-search-kit";
import { lexicon } from "fa-search-kit/lexicon";
import { faPagefind } from "fa-search-kit/pagefind";
import { rescuePagefindUI } from "fa-search-kit/pagefind/rescue";
const analyzer = createAnalyzer({ profile: "full", lexicon, verbs: "lemma" });
const fa = faPagefind({ analyzer });
const box = document.querySelector("#search-notice");
const bundlePath = new URL("./pagefind/", document.baseURI).href;
const rescue = rescuePagefindUI({
  fa, analyzer, bundlePath,
  wordsPath: new URL("./fa-words/", document.baseURI).href,
  onNotice(notice) {
    box.replaceChildren();
    if (!notice) return;
    const action = document.createElement("button");
    action.type = "button";
    if (notice.fixed) {
      box.append(`نتیجه‌ها برای «${notice.to}» `);
      action.textContent = `جستجوی «${notice.from}» به همان صورت`;
    } else {
      action.textContent = `منظورتان «${notice.to}» بود؟`;
    }
    action.addEventListener("click", () => notice.other());
    box.append(action);
  },
});
const ui = new PagefindUI({
  element: "#search", bundlePath,
  processTerm: rescue.processTerm,
  processResult: fa.processResult,
});
rescue.attach(ui);
```

نخستین جستجو هم‌زمان و به همان صورت تایپ‌شده اجرا می‌شود. اصلاح، همان بسته Pagefind را ناهم‌زمان بررسی می‌کند، عبارت پیشنهادی را می‌آزماید و فقط اگر ورودی هنوز همان باشد جستجو را تکرار می‌کند. `notice.other()` انتخاب جستجو به همان صورت را برای آن متن به خاطر می‌سپارد. رابط سفارشی جاوااسکریپت می‌تواند `createRescue`، `fetchWords` و `pagefindKnows` را ترکیب کند. این تنظیم اختیاری، پیکربندی جستجوی مستندات ارم نیست.

## محدودیت و چرخه عمر

واژه درست غایب از سایت، نام، کد مدل لاتین و ورودی مبهم صفحه‌کلید ممکن است اشتباه اصلاح شوند. اصلاح‌گر فینگلیش، مترادف، تغییر دلخواه حرف اول میان گروه‌های قطعه یا املای بسیار متفاوت را حل نمی‌کند. واژه سه‌حرفی فقط هزینه کم تغییر هم‌صدا را می‌پذیرد؛ واژه کوتاه‌تر نامزد اصلاح املایی نیست. فهرست عمومی چندپیشنهادی وجود ندارد.

برای واژه‌های جمع‌شده API حذف یا بازنشانی وجود ندارد و نتیجه تشخیص واژه شناخته‌شده ذخیره می‌شود. پس از تغییر مجموعه محتوا، به‌ویژه پس از پاسخ منفی تشخیص واژه، نمونه اصلاح را دوباره بسازید؛ افزودن متن این حافظه نهان را پاک نمی‌کند. [اشکال‌های شناخته‌شده](recipes.md) و [مرجع API](api/rescue.md) را ببینید.
