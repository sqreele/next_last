import PMMasterPlanForm from "@/app/components/preventive/PMMasterPlanForm";
import { PlanPageHeader } from "@/app/components/preventive/PlanPageHeader";

type PageProps = { params: Promise<{ plan_id: string }> };

export default async function EditPMMasterPlanPage({ params }: PageProps) {
  const { plan_id: planId } = await params;
  return (
    <main className="min-h-screen bg-muted px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl">
        <PlanPageHeader mode="edit" planId={planId} />
        <PMMasterPlanForm planId={planId} />
      </div>
    </main>
  );
}
