/** Validate the publishing contract and execute the examples printed in the docs.
 * Run after npm run build. Browser fences are bundled, not executed as a live UI.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = resolve(root, 'docs');
const read = path => readFileSync(path, 'utf8');
const nav = JSON.parse(read(resolve(docs, 'navigation.json')));
const pkg = JSON.parse(read(resolve(root, 'package.json')));
const slugPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
assert.deepEqual(Object.keys(nav).sort(), ['defaultLocale', 'entry', 'locales', 'schemaVersion', 'sections']);
assert.equal(nav.schemaVersion, 1);
assert.equal(nav.defaultLocale, 'en');
assert.deepEqual(nav.locales, ['en', 'fa']);
const slugs = [], ids = new Set();
for (const section of nav.sections) {
  assert.deepEqual(Object.keys(section).sort(), ['id', 'pages', 'title']);
  assert.match(section.id, slugPattern);
  assert(!ids.has(section.id)); ids.add(section.id);
  assert.deepEqual(Object.keys(section.title).sort(), ['en', 'fa']);
  for (const locale of nav.locales) assert(section.title[locale].trim());
  assert(section.pages.length > 0);
  for (const slug of section.pages) {
    assert.match(slug, slugPattern);
    assert(!slugs.includes(slug), `Duplicate ${slug}`);
    slugs.push(slug);
  }
}
assert(slugs.includes(nav.entry));
const fences = text => [...text.matchAll(/^```([^\n]*)\n([\s\S]*?)^```\s*$/gm)];
const withoutCode = text => text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '').replace(/`[^`]*`/g, '');
let examples = 0, browserExamples = 0, links = 0;
for (const locale of nav.locales) {
  const localeRoot = resolve(docs, locale);
  const files = readdirSync(localeRoot, { recursive: true }).filter(f => f.endsWith('.md')).map(f => f.replaceAll(sep, '/').slice(0, -3)).sort();
  assert.deepEqual(files, [...slugs].sort(), `Unlisted/missing ${locale} page`);
  for (const slug of slugs) {
    const file = resolve(localeRoot, `${slug}.md`), raw = read(file);
    const front = /^---\ntitle: (.+)\ndescription: (.+)\n---\n\n# (.+)\n/.exec(raw);
    assert(front, `Frontmatter/H1: ${file}`);
    const title = JSON.parse(front[1]), description = JSON.parse(front[2]);
    assert.equal(title, front[3]); assert(description.trim());
    const prose = withoutCode(raw);
    assert.equal((prose.match(/^# /gm) ?? []).length, 1, file);
    assert.match(prose, /^## /m);
    assert(!/<\/?[A-Za-z][^>]*>/.test(prose), `Raw HTML: ${file}`);
    if (locale === 'fa') {
      assert(/[\u0600-\u06ff]/.test(title) && /[\u0600-\u06ff]/.test(description));
      assert(!/[\u064b-\u065f\u0670]/.test(prose), `Persian vowel marks: ${file}`);
      // Arabic letter examples are quoted deliberately; other prose must use Persian letters.
      const authored = prose.replace(/«[^»]*»/g, '');
      assert(!/[يك]/.test(authored), `Arabic yeh/kaf in authored prose: ${file}`);
    }
    for (const match of prose.matchAll(/(!?)\[[^\]]*\]\(([^)]+)\)/g)) {
      const [,,url] = match;
      assert(!url.startsWith('/') && !/^[a-z]+:/i.test(url), `Use relative links: ${url}`);
      const [target, fragment] = url.split('#');
      assert(!fragment, `Add fragment validation before introducing anchor links: ${url}`);
      const resolved = resolve(dirname(file), decodeURIComponent(target));
      assert(resolved.startsWith(root + sep) && existsSync(resolved), `Broken link: ${file}: ${url}`);
      if (match[1]) assert(resolved.startsWith(resolve(docs, 'assets') + sep), 'Image outside docs/assets');
      else if (resolved.startsWith(localeRoot + sep) && resolved.endsWith('.md')) assert(slugs.includes(relative(localeRoot, resolved).slice(0, -3).replaceAll(sep, '/')));
      links++;
    }
    const blocks = fences(raw);
    if (locale === 'fa') {
      assert.deepEqual(blocks.map(m => [m[1], m[2]]), fences(read(resolve(docs, 'en', `${slug}.md`))).map(m => [m[1], m[2]]), `Code drift: ${slug}`);
      continue;
    }
    for (const [, info, source] of blocks) {
      if (!info.startsWith('js')) continue;
      for (const [, spec] of source.matchAll(/["'](fa-search-kit(?:\/[^"']*)?)["']/g)) {
        const key = spec === 'fa-search-kit' ? '.' : '.' + spec.slice('fa-search-kit'.length);
        assert(Object.hasOwn(pkg.exports, key), `Non-public import ${spec}`);
      }
      if (info === 'js browser') {
        await build({ stdin: { contents: source, resolveDir: root, sourcefile: `${slug}.mjs` }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
        browserExamples++;
      } else {
        assert.equal(info, 'js', `Unknown JS fence: ${info}`);
        const expected = [...source.matchAll(/\/\/ => (.+)$/gm)].map(m => JSON.parse(m[1]));
        assert(expected.length > 0, `Example needs recorded output: ${slug}`);
        const stdout = execFileSync(process.execPath, ['--input-type=module', '--eval', source], { cwd: root, encoding: 'utf8', timeout: 60000 });
        const actual = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        assert.deepEqual(actual, expected, `Example output: ${slug}`);
        examples++;
      }
    }
  }
}
console.log(`${slugs.length} pages × 2 locales; ${links} links; ${examples} executed examples; ${browserExamples} browser bundles: passed`);
