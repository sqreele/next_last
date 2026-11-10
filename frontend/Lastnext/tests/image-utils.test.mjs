import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/lib/utils/image-utils.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports, process: { env: { NODE_ENV: 'production' } } });
const { fixImageUrl } = exports;

test('machine photos preserve storage escapes for Thai filenames', () => {
  const path = '/media/machine_images/2026/08/LINE_ALBUM_%E0%B8%8A%E0%B8%993_260812_5.jpg';
  assert.equal(fixImageUrl(path), path);
  assert.equal(fixImageUrl(`http://backend:8000${path}`), path);
  assert.equal(fixImageUrl(fixImageUrl(path)), path);
});

test('raw filenames encode Unicode, spaces and literal percent signs once', () => {
  const raw = '/media/machine_images/ชั้น 3 100%.jpg';
  const encoded = encodeURI(raw);
  assert.equal(fixImageUrl(raw), encoded);
  assert.equal(fixImageUrl(encoded), encoded);
});

test('encoded filename delimiters and duplicate media prefixes stay valid', () => {
  assert.equal(fixImageUrl('/media/media/machine_images/a%23b%20c.jpg'), '/media/machine_images/a%23b%20c.jpg');
  assert.equal(fixImageUrl(null), null);
});
