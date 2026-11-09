const assert = require('node:assert/strict');
const test = require('node:test');
const { jsPDF } = require('jspdf');

test('maintained PDF library supports the report text, image and page APIs', () => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  doc.text('StayMaint report compatibility', 10, 10);
  // Inline image data requires no filesystem permission or network resource.
  doc.addImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgSQ4DAAFEAMbmQLnHAAAAAElFTkSuQmCC', 'PNG', 10, 20, 5, 5);
  doc.addPage();
  doc.text('Second page', 10, 10);
  assert.equal(doc.getNumberOfPages(), 2);
  const bytes = Buffer.from(doc.output('arraybuffer'));
  assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
});
