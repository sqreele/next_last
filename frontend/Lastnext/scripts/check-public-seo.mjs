import assert from 'node:assert/strict';
import sharp from 'sharp';

// Run against a local preview or a deployed site: node scripts/check-public-seo.mjs <origin>
const origin = process.argv[2] || 'http://127.0.0.1:3100';
for (const path of ['/missing-seo-audit.jpg', '/images/missing.png', '/fonts/missing.woff2', '/branding/missing.svg', '/missing-seo-audit/']) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 404, path);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex', path);
  console.log('404 + noindex', path);
}
for (const path of ['/og-image.jpg', '/branding/logo-mark-flat.svg', '/favicon-32.png', '/manifest.json', '/sw.js', '/robots.txt', '/sitemap.xml']) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
  if (path === '/og-image.jpg') {
    assert.match(response.headers.get('content-type'), /image\/jpeg/);
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 630);
  }
  if (path === '/robots.txt') {
    const text = await response.text();
    for (const route of ['/auth/', '/login/', '/report/', '/invitations/', '/ai-chat/', '/offline/']) {
      assert.ok(!text.includes(`Disallow: ${route}`), route);
    }
    assert.ok(text.includes('Disallow: /dashboard/'));
    assert.ok(text.includes('Disallow: /api/'));
  }
  console.log('200', path);
}
for (const path of ['/auth/login/', '/offline/']) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
  assert.match(await response.text(), /<meta name="robots" content="noindex/);
  console.log('200 + noindex', path);
}
const homepage = await fetch(new URL('/', origin));
assert.equal(homepage.status, 200);
const html = await homepage.text();
assert.match(html, /<meta property="og:image" content="https:\/\/staymaint.com\/og-image.jpg"/);
assert.match(html, /<meta name="twitter:image" content="https:\/\/staymaint.com\/og-image.jpg"/);
console.log('Homepage social metadata OK');
