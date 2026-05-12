import { PageLoader } from '@/app/components/ui/loading';

export default function RosterLoading() {
  return <PageLoader label="Loading users" description="Loading technician roster and profile details." />;
}
