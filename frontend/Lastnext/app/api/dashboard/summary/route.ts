import { NextResponse } from 'next/server';
import type { DashboardSummaryResponse, MonthLabel } from '@/app/dashboard/chartdashboard/types';

const months: MonthLabel[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export async function GET() {
  const trendByMonth = months.flatMap((month, index) => [
    { month, year: 2024, jobs: 80 + index * 12 },
    { month, year: 2025, jobs: 95 + index * 14 },
  ]);

  const pmNonPmByMonth = months.flatMap((month, index) => [
    { month, year: 2024, pm: 30 + index * 4, nonPm: 50 + index * 6 },
    { month, year: 2025, pm: 35 + index * 5, nonPm: 60 + index * 7 },
  ]);

  const statusByMonth = months.flatMap((month, index) => [
    { month, year: 2024, status: 'Completed', count: 40 + index * 6 },
    { month, year: 2024, status: 'Waiting Sparepart', count: 25 + index * 3 },
    { month, year: 2024, status: 'Waiting Fix Defect', count: 15 + index * 2 },
    { month, year: 2025, status: 'Completed', count: 50 + index * 7 },
    { month, year: 2025, status: 'Waiting Sparepart', count: 28 + index * 3 },
    { month, year: 2025, status: 'Waiting Fix Defect', count: 17 + index * 2 },
  ]);

  const topUsersByMonth = months.flatMap((month, index) => [
    { month, year: 2024, user: 'Arthit', pm: 10 + index, nonPm: 14 + index * 2 },
    { month, year: 2024, user: 'Naree', pm: 12 + index, nonPm: 10 + index },
    { month, year: 2024, user: 'Piya', pm: 8 + index, nonPm: 11 + index },
    { month, year: 2025, user: 'Arthit', pm: 12 + index, nonPm: 15 + index * 2 },
    { month, year: 2025, user: 'Naree', pm: 13 + index, nonPm: 12 + index },
    { month, year: 2025, user: 'Piya', pm: 9 + index, nonPm: 13 + index },
  ]);

  const totalJobs = pmNonPmByMonth.reduce((sum, item) => sum + item.pm + item.nonPm, 0);
  const pmJobs = pmNonPmByMonth.reduce((sum, item) => sum + item.pm, 0);
  const nonPmJobs = pmNonPmByMonth.reduce((sum, item) => sum + item.nonPm, 0);
  const completedJobs = statusByMonth
    .filter((item) => item.status === 'Completed')
    .reduce((sum, item) => sum + item.count, 0);
  const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  const payload: DashboardSummaryResponse = {
    totalJobs,
    pmJobs,
    nonPmJobs,
    completionRate,
    trendByMonth,
    pmNonPmByMonth,
    statusByMonth,
    topUsersByMonth,
  };

  return NextResponse.json(payload);
}
