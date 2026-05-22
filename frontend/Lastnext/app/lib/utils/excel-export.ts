/**
 * Excel (XLSX) export utilities for jobs reports.
 *
 * Produces a multi-sheet workbook so hotel ops can hand a polished file to
 * managers without post-processing:
 *   - Summary: KPI counts, completion rate, response time.
 *   - Status / Priority / Monthly breakdowns.
 *   - Jobs: row-per-job detail (reuses the existing CSV column shape).
 */

import * as XLSX from 'xlsx';
import { Job, Property } from '@/app/lib/types';
import {
  CSVExportOptions,
  getJobsCSVHeaders,
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

function buildSummarySheet(opts: ExcelExportOptions): XLSX.WorkSheet {
  const generated = opts.generatedAt ?? new Date();
  const summary = opts.summary;
  const rows: (string | number)[][] = [
    ['Hotel Maintenance — Jobs Report'],
    [],
    ['Property', opts.propertyName ?? 'All properties'],
    ['Generated', generated.toLocaleString()],
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

function buildJobsSheet(
  jobs: Job[],
  properties: Property[],
  options: CSVExportOptions,
): XLSX.WorkSheet {
  const headers = getJobsCSVHeaders(options);
  const dataRows = jobs.map((job) => jobToCSVRow(job, properties, options));
  const rows: (string | number)[][] = [headers, ...dataRows];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = autoSizeColumns(rows);
  if (rows.length > 1) {
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) };
  }
  return sheet;
}

export function buildJobsReportWorkbook(
  jobs: Job[],
  properties: Property[] = [],
  options: ExcelExportOptions = {},
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(options), 'Summary');

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

  XLSX.utils.book_append_sheet(workbook, buildJobsSheet(jobs, properties, options), 'Jobs');
  return workbook;
}

export function exportJobsToExcel(
  jobs: Job[],
  properties: Property[] = [],
  options: ExcelExportOptions = {},
): void {
  const workbook = buildJobsReportWorkbook(jobs, properties, options);
  const date = (options.generatedAt ?? new Date()).toISOString().split('T')[0];
  const slug = (options.propertyName ?? 'jobs').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const filename = options.filename ?? `${slug}-jobs-report-${date}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
