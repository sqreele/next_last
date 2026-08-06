import PreventiveMaintenanceDetailLoader from './PreventiveMaintenanceDetailLoader';

type PageProps = {
  params: Promise<{ pm_id: string }>;
};

export default async function PreventiveMaintenanceDetailPage({ params }: PageProps) {
  const { pm_id: pmId } = await params;

  return <PreventiveMaintenanceDetailLoader pmId={pmId} />;
}
