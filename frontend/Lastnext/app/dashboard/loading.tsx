import { PageLoader } from '@/app/components/ui/loading';

export default function DashboardLoading() {
  return <PageLoader label="Loading dashboard" description="Refreshing KPIs, jobs, rooms, reports, and technician data." />;
}
