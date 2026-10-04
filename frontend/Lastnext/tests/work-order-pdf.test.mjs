import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL(
  '../app/dashboard/jobs/[jobId]/print/PrintableWorkOrder.tsx',
  import.meta.url,
);

test('work-order PDF export converts Tailwind 4 colors for html2canvas', async () => {
  const source = await readFile(componentUrl, 'utf8');

  assert.match(source, /data-work-order-pdf-content/);
  assert.match(source, /\(\?:oklab\|oklch\|color-mix\)/);
  assert.match(source, /onclone: applyPdfColorFallbacks/);
});
