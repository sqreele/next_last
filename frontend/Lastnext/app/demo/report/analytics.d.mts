export type AnalyticsJob = { created?: string; technician?: string; status: string };
export type Workload = { total: number; completed: number; open: number; cancelled: number };
export function jobPeriod(job: AnalyticsJob): { year: string; month: number } | null;
export function aggregateReport(jobs: AnalyticsJob[]): {
  monthly: Array<Workload & { month: number }>;
  technicians: Array<Workload & { name: string }>;
  undated: number;
};
