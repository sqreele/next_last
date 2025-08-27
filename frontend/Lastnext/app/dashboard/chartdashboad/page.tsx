import { redirect } from 'next/navigation';

export default function LegacyChartDashboardRedirect() {
  redirect('/dashboard/chartdashboard/');
}