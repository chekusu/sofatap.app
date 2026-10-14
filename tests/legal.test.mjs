// The privacy policy and support page: product documents republished in every language.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEGAL_PAGES, build, legalHref, legalLink, loadLegalDocuments } from '../scripts/build.mjs';
import { checkSite, markdownWords } from '../scripts/check.mjs';
import { LOCALES } from '../scripts/locales.mjs';
import { renderInline, renderMarkdown, resolveRepoPath } from '../scripts/markdown.mjs';
import { publicFiles } from '../scripts/prepare-deploy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-legal-'));
after(() => rm(tmp, { recursive: true, force: true }));
const config = path.join(tmp, 'site.config.json');
await writeFile(config, JSON.stringify({ mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' }));
const out = path.join(tmp, 'site');
await build({ config, out });
const page = (dir, kind) => readFile(path.join(out, dir, kind, 'index.html'), 'utf8');

test('the vendored documents are exactly the pinned product files', async () => {
  const source = JSON.parse(await readFile(path.join(ROOT, 'src', 'legal', 'source.json'), 'utf8'));
  assert.equal(source.commit, '6cb7799d574c37c2f5ac6a455db3cdd7b7d4e856');
  for (const [kind, entry] of Object.entries(source.documents)) {
    const text = await readFile(path.join(ROOT, 'src', 'legal', `${kind}.md`));
    assert.equal(createHash('sha256').update(text).digest('hex'), entry.sha256, kind);
  }
  // Only the one recorded, reasoned correction to the support page; the policy is untouched.
  assert.deepEqual(source.adaptations.map((a) => a.document), ['support']);
  assert.ok(source.adaptations[0].reason && source.adaptations[0].evidence.length >= 1);
  const { docs } = await loadLegalDocuments();
  assert.equal(docs.privacy.adapted, false);
  assert.equal(docs.privacy.text, await readFile(path.join(ROOT, 'src', 'legal', 'privacy.md'), 'utf8'));
  assert.match(docs.support.text, /Many browser and custom fields, Linux and older receivers use a draft/);
  assert.match(docs.support.text, /line breaks included in the text may act as Enter/);
  assert.doesNotMatch(docs.support.text, /^Browsers, custom fields/m);
});

test('every language has both pages, linked from its home page and to each other', async () => {
  assert.equal(LEGAL_PAGES.length, LOCALES.length * 2);
  for (const l of LOCALES) {
    const home = await readFile(path.join(out, l.dir, 'index.html'), 'utf8');
    assert.ok(home.includes('<a href="privacy/">') && home.includes('<a href="support/">'), l.lang);
    for (const kind of ['privacy', 'support']) {
      const html = await page(l.dir, kind);
      assert.match(html, new RegExp(`<html lang="${l.lang}" dir="${l.rtl ? 'rtl' : 'ltr'}"`));
      assert.match(html, /<article class="legal" lang="en" dir="ltr">/);
      assert.match(html, /<a class="brand" href="\.\.\/">/);
      for (const other of LOCALES) assert.ok(html.includes(`<a href="${legalHref(l.lang, other.lang, kind)}" hreflang="${other.lang}"`), `${l.lang} ${kind} → ${other.lang}`);
    }
  }
  assert.equal(legalHref('en', 'zh-CN', 'privacy'), '../zh/privacy/');
  assert.equal(legalHref('pt-BR', 'en', 'support'), '../../support/');
  assert.equal(legalHref('ja', 'ja', 'support'), '../support/');
});

test('the documents keep their contact route, company and downloads; links are rewritten safely', async () => {
  const privacy = await page('', 'privacy');
  const support = await page('ar', 'support');
  assert.match(privacy, /<h1>Sofatap Privacy Policy<\/h1>/);
  assert.match(privacy, /Sofatap is provided by CHEKUSU INC\./);
  assert.match(privacy, /<a href="https:\/\/github\.com\/chekusu\/sofatap\/issues">Sofatap issue tracker<\/a>/);
  assert.match(support, /<a href="https:\/\/github\.com\/chekusu\/sofatap\/issues\/new">open a Sofatap issue<\/a>/);
  assert.match(support, /<a href="\.\.\/privacy\/">Read the Sofatap Privacy Policy<\/a>/);
  assert.match(support, /href="https:\/\/github\.com\/chekusu\/sofatap\/blob\/main\/docs\/MAC-START\.md"/);
  assert.match(support, /releases\/download\/v0\.7\.1-beta\.1\/SofaTap-Linux-arm64\.tar\.gz/);
  assert.match(support, /<p class="callout callout--quiet">/);
  assert.doesNotMatch(privacy, /callout--quiet/);
  assert.match(support, /blob\/6cb7799d574c37c2f5ac6a455db3cdd7b7d4e856\/docs\/app-store\/support\.md/);
});

test('Markdown: only the syntax the documents use, escaped, with resolved links', () => {
  const link = (href) => legalLink('docs/app-store/support.md', href);
  assert.equal(renderInline('a **b** `<c>` [d](../../PRIVACY.md)', link), 'a <strong>b</strong> <code>&lt;c&gt;</code> <a href="../privacy/">d</a>');
  assert.equal(link('../MAC-START.md'), 'https://github.com/chekusu/sofatap/blob/main/docs/MAC-START.md');
  assert.equal(link('https://example.org/x'), 'https://example.org/x');
  assert.throws(() => link('javascript:alert(1)'), /不受支持/);
  assert.throws(() => link('../../../../x.md'), /超出仓库/);
  assert.throws(() => link('../images/a.png'), /不受支持/);
  assert.equal(resolveRepoPath('docs/app-store/support.md', '../../desktop/linux/README.md'), 'desktop/linux/README.md');
  const html = renderMarkdown('# T\n\n- one\n  two\n- three\n\n| A | B |\n| --- | ---: |\n| x | 1 |\n\n<b>raw</b>', { link });
  assert.match(html, /<h1>T<\/h1>/);
  assert.match(html, /<ul><li>one two<\/li><li>three<\/li><\/ul>/);
  assert.match(html, /<th scope="col" class="num">B<\/th>/);
  assert.match(html, /<p>&lt;b&gt;raw&lt;\/b&gt;<\/p>/);
  assert.throws(() => renderMarkdown('| a |\n| b |', { link }), /表格/);
});

test('the check catches a changed word in a republished document', async () => {
  assert.deepEqual((await checkSite(out)).problems, []);
  assert.deepEqual(markdownWords('A [b](x.md) **c**.\n\n| d | e |\n| --- | --- |'), ['A', 'b', 'c.', 'd', 'e']);
  const file = path.join(out, 'de', 'privacy', 'index.html');
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('does not save or upload the camera images', 'may upload the camera images'));
  const problems = (await checkSite(out)).problems;
  await writeFile(file, html);
  assert.ok(problems.some((p) => p.startsWith('[privacy de]') && p.includes('不一致')), problems.join('\n'));
});

test('the release file list includes both pages in every language', async () => {
  const files = await publicFiles();
  for (const p of LEGAL_PAGES) assert.ok(files.has(`${p.dir}/index.html`), p.dir);
});
