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
  assert.match(source, /willReadFrequently: true/);
  assert.match(source, /computedStyle\.length/);
  assert.match(source, /property\.startsWith\('--'\)/);
  assert.match(source, /data-work-order-pdf-content] \*::before/);
});

test('work-order PDF export slices large canvases into memory-safe JPEG pages', async () => {
  const source = await readFile(componentUrl, 'utf8');

  assert.match(source, /pageCanvasHeight/);
  assert.match(source, /pageCanvas\.toDataURL\('image\/jpeg', 0\.9\)/);
  assert.match(source, /sourceY \+= sliceHeight/);
  assert.doesNotMatch(source, /pdf\.addImage\(imageData, 'PNG'/);
});

test('work-order PDF export reports the stage that failed', async () => {
  const source = await readFile(componentUrl, 'utf8');

  assert.match(source, /let exportStage = 'loading the PDF tools'/);
  assert.match(source, /Could not download PDF while \$\{exportStage\}: \$\{reason\}/);
});
