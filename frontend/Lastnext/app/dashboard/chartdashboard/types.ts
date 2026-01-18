export type MonthLabel =
  | 'Jan'
  | 'Feb'
  | 'Mar'
  | 'Apr'
  | 'May'
  | 'Jun'
  | 'Jul'
  | 'Aug'
  | 'Sep'
  | 'Oct'
  | 'Nov'
  | 'Dec';

export interface TrendPoint {
  month: MonthLabel;
  year: number;
  jobs: number;
}

export interface PMNonPMPoint {
  month: MonthLabel;
  year: number;
  pm: number;
  nonPm: number;
}

export interface StatusPoint {
  month: MonthLabel;
  year: number;
  status: 'Completed' | 'Waiting Sparepart' | 'Waiting Fix Defect';
  count: number;
}

export interface TopUserPoint {
  month: MonthLabel;
  year: number;
  user: string;
  pm: number;
  nonPm: number;
}

export interface DashboardSummaryResponse {
  totalJobs: number;
  pmJobs: number;
  nonPmJobs: number;
  completionRate: number;
  trendByMonth: TrendPoint[];
  pmNonPmByMonth: PMNonPMPoint[];
  statusByMonth: StatusPoint[];
  topUsersByMonth: TopUserPoint[];
}
