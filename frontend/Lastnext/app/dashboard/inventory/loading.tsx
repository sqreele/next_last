import { PageLoader } from '@/app/components/ui/loading';

export default function Loading() {
  return <PageLoader label="Loading inventory" description="Preparing stock totals, filters, and items." />;
}
