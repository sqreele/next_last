/**
 * Excel (XLSX) export utilities for jobs reports.
 *
 * Produces a multi-sheet workbook so hotel ops can hand a polished file to
 * managers without post-processing:
 *   - Summary: KPI counts, completion rate, response time.
 *   - Status / Priority / Monthly breakdowns.
 *   - Jobs: row-per-job detail (reuses the existing CSV column shape).
 */


import { appDateKey, formatAppDateTime, DEFAULT_APP_TIME_ZONE } from '@/app/lib/date-time.mjs';
import * as XLSX from 'xlsx';
import { Job, Property } from '@/app/lib/types';
import {
  CSVExportOptions,
  getJobsCSVHeaders,
  getJobImageUrls,
  jobToCSVRow,
} from '@/app/lib/utils/csv-export';

export interface JobsReportSummary {
  total: number;
  pmJobs: number;
  nonPmJobs: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  waitingSparepart: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  completionRate: number;
  averageResponseTime: number;
  jobsByMonth: Array<{ month: string; count: number }>;
  jobsByStatus: Array<{ status: string; count: number }>;
}

export interface ExcelExportOptions extends CSVExportOptions {
  propertyName?: string;
  summary?: JobsReportSummary;
  generatedAt?: Date;
  filterDescription?: string;
}

function autoSizeColumns(rows: (string | number)[][]): XLSX.ColInfo[] {
  if (rows.length === 0) return [];
  const widths = rows[0].map((_, colIndex) => {
    const max = rows.reduce((acc, row) => {
      const cell = row[colIndex];
      const value = cell == null ? '' : String(cell);
      return Math.max(acc, value.length);
    }, 10);
    return { wch: Math.min(max + 2, 60) };
  });
  return widths;
}

function buildSummarySheet(opts: ExcelExportOptions, appTimeZone: string = DEFAULT_APP_TIME_ZONE): XLSX.WorkSheet {
  const generated = opts.generatedAt ?? new Date();
  const summary = opts.summary;
  const rows: (string | number)[][] = [
    ['Hotel Maintenance — Jobs Report'],
    [],
    ['Property', opts.propertyName ?? 'All properties'],
    ['Generated', formatAppDateTime(generated, undefined, { timeZone: appTimeZone })],
  ];
  if (opts.filterDescription) {
    rows.push(['Filters', opts.filterDescription]);
  }
  if (summary) {
    rows.push(
      [],
      ['Key metrics'],
      ['Total jobs', summary.total],
      ['Completed', summary.completed],
      ['In progress', summary.inProgress],
      ['Pending', summary.pending],
      ['Waiting spare parts', summary.waitingSparepart],
      ['Cancelled', summary.cancelled],
      ['Completion rate (%)', summary.completionRate],
      ['Avg. response time (days)', summary.averageResponseTime],
      [],
      ['Preventive maintenance'],
      ['PM jobs', summary.pmJobs],
      ['Non-PM jobs', summary.nonPmJobs],
      [],
      ['Priority breakdown'],
      ['High', summary.highPriority],
      ['Medium', summary.mediumPriority],
      ['Low', summary.lowPriority],
    );
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 30 }, { wch: 36 }];
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  return sheet;
}

function buildBreakdownSheet(
  header: [string, string],
  data: Array<{ label: string; count: number }>,
): XLSX.WorkSheet {
  const rows: (string | number)[][] = [header, ...data.map((row) => [row.label, row.count])];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = autoSizeColumns(rows);
  return sheet;
}

function excelImageFormula(url: string): string {
  const safeUrl = url.replace(/"/g, '""');
  return `IMAGE("${safeUrl}")`;
}

function buildJobsSheet(
  jobs: Job[],
  properties: Property[],
  options: CSVExportOptions, appTimeZone: string = DEFAULT_APP_TIME_ZONE
): XLSX.WorkSheet {
  const headers = getJobsCSVHeaders(options);
  const dataRows = jobs.map((job) => jobToCSVRow(job, properties, options, appTimeZone));
  const rows: (string | number)[][] = [headers, ...dataRows];
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  if (options.includeImages) {
    const maxImageColumns = Math.max(1, options.maxImageColumns ?? 3);
    const firstImageColumn = headers.length - maxImageColumns;
    jobs.forEach((job, jobIndex) => {
      getJobImageUrls(job).slice(0, maxImageColumns).forEach((url, imageIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: jobIndex + 1, c: firstImageColumn + imageIndex });
        sheet[cellAddress] = { t: 's', f: excelImageFormula(url), v: url };
      });
    });
  }

  sheet['!cols'] = autoSizeColumns(rows).map((col, index) => (
    options.includeImages && index >= headers.length - Math.max(1, options.maxImageColumns ?? 3)
      ? { wch: 18 }
      : col
  ));
  if (options.includeImages && rows.length > 1) {
    sheet['!rows'] = rows.map((_, index) => (index === 0 ? { hpt: 20 } : { hpt: 90 }));
  }
  if (rows.length > 1) {
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) };
  }
  return sheet;
}

export function buildJobsReportWorkbook(
  jobs: Job[],
  properties: Property[] = [],
  options: ExcelExportOptions = {}, appTimeZone: string = DEFAULT_APP_TIME_ZONE
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(options, appTimeZone), 'Summary');

  if (options.summary) {
    XLSX.utils.book_append_sheet(
      workbook,
      buildBreakdownSheet(
        ['Status', 'Jobs'],
        options.summary.jobsByStatus.map((s) => ({ label: s.status, count: s.count })),
      ),
      'By status',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      buildBreakdownSheet(
        ['Month', 'Jobs'],
        options.summary.jobsByMonth.map((s) => ({ label: s.month, count: s.count })),
      ),
      'By month',
    );
  }

  XLSX.utils.book_append_sheet(workbook, buildJobsSheet(jobs, properties, options, appTimeZone), 'Jobs');
  return workbook;
}

export function exportJobsToExcel(
  jobs: Job[],
  properties: Property[] = [],
  options: ExcelExportOptions = {}, appTimeZone: string = DEFAULT_APP_TIME_ZONE
): void {
  const workbook = buildJobsReportWorkbook(jobs, properties, options, appTimeZone);
  const date = appDateKey(options.generatedAt ?? new Date(), appTimeZone);
  const slug = (options.propertyName ?? 'jobs').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const filename = options.filename ?? `${slug}-jobs-report-${date}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
