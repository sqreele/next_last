/**
 * PDF export for jobs reports.
 *
 * Uses jsPDF directly (no autotable dependency) to keep the bundle small.
 * Produces a one-page-summary + paginated jobs table.
 */

import { jsPDF } from 'jspdf';
import { Job, Property } from '@/app/lib/types';
import { JobsReportSummary } from '@/app/lib/utils/excel-export';
import { getDisplayName } from '@/app/lib/utils/display-name';

export interface PdfExportOptions {
  propertyName?: string;
  summary?: JobsReportSummary;
  generatedAt?: Date;
  filterDescription?: string;
  filename?: string;
}

const MARGIN = 36;
const LINE = 14;

function safe(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getRoomLabel(job: Job): string {
  if (job.rooms && job.rooms.length > 0) {
    return job.rooms
      .map((room) => safe(room.name, `Room ${room.room_id ?? ''}`.trim()))
      .filter(Boolean)
      .join(', ');
  }
  return safe(job.room_name, '—');
}

function getPropertyLabel(job: Job, properties: Property[]): string {
  const lookup = (id: unknown): string | null => {
    if (id == null) return null;
    const key = typeof id === 'object' && id ? String((id as { property_id?: string; id?: string }).property_id ?? (id as { id?: string }).id ?? '') : String(id);
    if (!key) return null;
    const found = properties.find((p) => String(p.property_id) === key || String(p.id) === key);
    return found?.name ?? key;
  };
  return lookup(job.property_id) ?? (job.properties?.map(lookup).filter(Boolean).join(', ') || '—');
}

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, MARGIN, MARGIN);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(subtitle, MARGIN, MARGIN + 16);
  doc.setTextColor(0);
}

function drawFooter(doc: jsPDF, page: number, pageCount: number) {
  const { width, height } = doc.internal.pageSize;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(`Page ${page} of ${pageCount}`, width - MARGIN, height - 18, { align: 'right' });
  doc.text('PCMS — Hotel Maintenance Report', MARGIN, height - 18);
  doc.setTextColor(0);
}

function drawSummary(doc: jsPDF, opts: PdfExportOptions): number {
  let y = MARGIN + 40;
  const summary = opts.summary;
  if (opts.filterDescription) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(80);
    const wrapped = doc.splitTextToSize(`Filters: ${opts.filterDescription}`, doc.internal.pageSize.width - MARGIN * 2);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 11 + 6;
    doc.setTextColor(0);
  }

  if (!summary) return y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Key metrics', MARGIN, y);
  y += LINE;

  const tiles: Array<[string, string]> = [
    ['Total jobs', String(summary.total)],
    ['Completed', String(summary.completed)],
    ['In progress', String(summary.inProgress)],
    ['Pending', String(summary.pending)],
    ['Waiting parts', String(summary.waitingSparepart)],
    ['Cancelled', String(summary.cancelled)],
    ['Completion rate', `${summary.completionRate}%`],
    ['Avg. response', `${summary.averageResponseTime} d`],
  ];
  const tileWidth = (doc.internal.pageSize.width - MARGIN * 2 - 12) / 4;
  const tileHeight = 44;
  tiles.forEach((tile, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = MARGIN + col * (tileWidth + 4);
    const ty = y + row * (tileHeight + 6);
    doc.setDrawColor(220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, ty, tileWidth, tileHeight, 4, 4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(tile[0], x + 8, ty + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(tile[1], x + 8, ty + 32);
  });
  doc.setTextColor(0);
  y += Math.ceil(tiles.length / 4) * (tileHeight + 6) + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Status breakdown', MARGIN, y);
  y += LINE;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  summary.jobsByStatus.forEach((row) => {
    doc.text(`${row.status}`, MARGIN, y);
    doc.text(String(row.count), MARGIN + 160, y, { align: 'right' });
    y += 12;
  });

  return y + 6;
}

interface TableColumn {
  key: string;
  label: string;
  width: number;
  value: (job: Job, properties: Property[]) => string;
}

const COLUMNS: TableColumn[] = [
  { key: 'job_id', label: 'Job ID', width: 70, value: (j) => safe(j.job_id).slice(0, 12) },
  { key: 'status', label: 'Status', width: 70, value: (j) => safe(j.status, 'pending') },
  { key: 'priority', label: 'Priority', width: 50, value: (j) => safe(j.priority, 'Medium') },
  { key: 'room', label: 'Room', width: 110, value: (j) => getRoomLabel(j) },
  { key: 'property', label: 'Property', width: 90, value: (j, p) => getPropertyLabel(j, p) },
  { key: 'user', label: 'Assigned', width: 90, value: (j) => getDisplayName(j.user, safe(j.technician_name || j.user_name, 'Unassigned')) },
  { key: 'created', label: 'Created', width: 60, value: (j) => formatDate(j.created_at) },
  { key: 'completed', label: 'Completed', width: 60, value: (j) => formatDate(j.completed_at) },
];

function drawTableHeader(doc: jsPDF, y: number, columns: TableColumn[]): number {
  doc.setFillColor(15, 23, 42);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  let x = MARGIN;
  doc.rect(MARGIN, y - 11, columns.reduce((s, c) => s + c.width, 0), 16, 'F');
  columns.forEach((col) => {
    doc.text(col.label, x + 4, y);
    x += col.width;
  });
  doc.setTextColor(0);
  return y + 8;
}

function drawTableRow(
  doc: jsPDF,
  y: number,
  job: Job,
  properties: Property[],
  columns: TableColumn[],
  zebra: boolean,
): number {
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const rowHeight = 16;
  if (zebra) {
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y - 10, totalWidth, rowHeight, 'F');
  }
  let x = MARGIN;
  columns.forEach((col) => {
    const text = col.value(job, properties);
    const wrapped = doc.splitTextToSize(text || '—', col.width - 6);
    doc.text(wrapped[0] ?? '', x + 4, y);
    x += col.width;
  });
  doc.setDrawColor(232);
  doc.line(MARGIN, y + 5, MARGIN + totalWidth, y + 5);
  return y + rowHeight;
}

export function exportJobsReportToPdf(
  jobs: Job[],
  properties: Property[] = [],
  options: PdfExportOptions = {},
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const generated = options.generatedAt ?? new Date();
  const title = `${options.propertyName ?? 'All properties'} — Jobs Report`;
  const subtitle = `${jobs.length} jobs · Generated ${generated.toLocaleString()}`;

  drawHeader(doc, title, subtitle);
  let y = drawSummary(doc, options);

  if (y > doc.internal.pageSize.height - 120) {
    doc.addPage();
    drawHeader(doc, title, subtitle);
    y = MARGIN + 40;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Job rows', MARGIN, y);
  y += LINE;

  y = drawTableHeader(doc, y, COLUMNS);
  jobs.forEach((job, index) => {
    if (y > doc.internal.pageSize.height - MARGIN - 20) {
      doc.addPage();
      drawHeader(doc, title, subtitle);
      y = MARGIN + 40;
      y = drawTableHeader(doc, y, COLUMNS);
    }
    y = drawTableRow(doc, y, job, properties, COLUMNS, index % 2 === 1);
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    drawFooter(doc, i, pageCount);
  }

  const date = generated.toISOString().split('T')[0];
  const slug = (options.propertyName ?? 'jobs').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const filename = options.filename ?? `${slug}-jobs-report-${date}.pdf`;
  doc.save(filename);
}
