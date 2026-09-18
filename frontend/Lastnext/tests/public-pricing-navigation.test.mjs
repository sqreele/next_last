import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const homepage = source('../app/HomepageClient.tsx');
const marketing = source('../app/components/marketing/SeoLandingPage.tsx');
const dictionary = source('../app/lib/i18n/dictionary.ts');
const login = source('../app/auth/login/page.tsx');
const register = source('../app/auth/register/page.tsx');

test('active public headers link Pricing to the canonical route', () => {
  assert.match(
    homepage,
    /<Button variant="ghost" size="sm" asChild>\s*<Link href="\/pricing\/">\{t\("nav\.pricing"\)\}<\/Link>/,
  );
  assert.match(
    marketing,
    /<Button variant="ghost" size="sm" asChild>\s*<Link href="\/pricing\/">\{pricingLabel\}<\/Link>/,
  );
});

test('Pricing remains visible in the shared compact mobile header', () => {
  const homepagePricing = homepage.match(
    /<Button variant="ghost" size="sm" asChild>\s*<Link href="\/pricing\/">\{t\("nav\.pricing"\)\}<\/Link>\s*<\/Button>/,
  )?.[0];
  const marketingPricing = marketing.match(
    /<Button variant="ghost" size="sm" asChild>\s*<Link href="\/pricing\/">\{pricingLabel\}<\/Link>\s*<\/Button>/,
  )?.[0];

  assert.ok(homepagePricing);
  assert.ok(marketingPricing);
  assert.doesNotMatch(homepagePricing, /hidden/);
  assert.doesNotMatch(marketingPricing, /hidden/);
});

test('English and Thai pricing labels use the existing dictionary architecture', () => {
  assert.match(dictionary, /'nav\.pricing': 'Pricing'/);
  assert.match(dictionary, /'nav\.pricing': 'ราคา'/);
  assert.match(marketing, /getDictionary\(page\.locale\)\["nav\.pricing"\]/);
});

test('homepage footer Pricing link uses the canonical route', () => {
  assert.match(
    homepage,
    /<Link href="\/pricing\/" className="hover:text-white">\s*Pricing\s*<\/Link>/,
  );
});

test('existing public Home, Contact, Sign in, and Register routes remain present', () => {
  assert.match(homepage, /href="\/"/);
  assert.match(marketing, /href="\/"/);
  assert.match(homepage, /href="\/auth\/login"/);
  assert.match(marketing, /href="\/auth\/login"/);
  assert.match(homepage, /href="\/auth\/register"/);
  assert.match(marketing, /href="\/auth\/register"/);
  assert.match(login, /href="\/contact"/);
  assert.match(register, /href="\/auth\/login"/);
});
