import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {
  ENGLISH_PUBLIC_PATHS, MARKETING_LANGUAGE_PAIRS, getMarketingAlternates,
  getPublicPageLocale, isMissingPublicPage, publicNotFoundHtml,
} from '../app/lib/public-seo.mjs';

const source = await readFile(new URL('../app/lib/marketing-pages.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { englishMarketingPages, thaiMarketingPages } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('public route policy covers every published marketing page', () => {
  assert.deepEqual(
    new Set(ENGLISH_PUBLIC_PATHS),
    new Set(['/', '/contact/', '/pricing/', ...Object.keys(englishMarketingPages).map(s => `/${s}/`)]),
  );
  assert.deepEqual(new Set(MARKETING_LANGUAGE_PAIRS.map(p => p.th)), new Set(Object.keys(thaiMarketingPages)));
  for (const slug of Object.keys(englishMarketingPages)) {
    assert.equal(getPublicPageLocale(`/${slug}/`), 'en');
    assert.equal(isMissingPublicPage(`/${slug}/`), false);
  }
  for (const slug of Object.keys(thaiMarketingPages)) {
    assert.equal(getPublicPageLocale(`/th/${encodeURIComponent(slug)}/`), 'th');
    assert.equal(isMissingPublicPage(`/th/${slug}/`), false);
  }
});

test('public language overrides preferences while application language remains configurable', () => {
  for (const preferred of ['en', 'th']) {
    assert.equal(getPublicPageLocale('/pricing/') ?? preferred, 'en');
    assert.equal(getPublicPageLocale('/th/ระบบแจ้งซ่อมโรงแรม/') ?? preferred, 'th');
    assert.equal(getPublicPageLocale('/dashboard/jobs/') ?? preferred, preferred);
    assert.equal(getPublicPageLocale('/demo/') ?? preferred, preferred);
  }
});

test('equivalent languages have reciprocal, self-inclusive alternatives', () => {
  for (const pair of MARKETING_LANGUAGE_PAIRS) {
    assert.ok(englishMarketingPages[pair.en]);
    assert.ok(thaiMarketingPages[pair.th]);
    const en = getMarketingAlternates(pair.en, 'en', 'https://staymaint.com');
    const th = getMarketingAlternates(pair.th, 'th', 'https://staymaint.com');
    assert.deepEqual(en.languages, th.languages);
    assert.equal(en.canonical, en.languages.en);
    assert.equal(th.canonical, th.languages.th);
  }
  assert.equal(getMarketingAlternates('hotel-cmms', 'en', 'https://staymaint.com').languages, undefined);
});

test('missing marketing URLs are rejected without intercepting application routes', () => {
  for (const path of ['/missing/', '/th/missing/', '/th/', '/hotel-cmms/extra/', '/contact/extra/', '/%ZZ/']) {
    assert.equal(isMissingPublicPage(path), true, path);
  }
  for (const path of ['/auth/login/', '/dashboard/', '/platform/tenants/123/', '/api/v1/billing/webhooks/stripe/', '/report/property/room/', '/demo/jobs/123/', '/profile/']) {
    assert.equal(isMissingPublicPage(path), false, path);
  }
});

test('marketing titles leave branding to the shared title template', () => {
  for (const page of [...Object.values(englishMarketingPages), ...Object.values(thaiMarketingPages)]) {
    assert.doesNotMatch(page.metaTitle, /\|\s*StayMaint/);
  }
});

test('early missing-page response is localized, nonindexable and navigable', () => {
  for (const locale of ['en', 'th']) {
    const html = publicNotFoundHtml(locale);
    assert.ok(html.startsWith(`<!doctype html><html lang="${locale}">`));
    assert.match(html, /name="robots" content="noindex,follow"/);
    assert.match(html, /href="\/"/);
    assert.match(html, /404/);
  }
});
