import PMMasterPlanForm from "@/app/components/preventive/PMMasterPlanForm";
import { PlanPageHeader } from "@/app/components/preventive/PlanPageHeader";

export default function CreatePMMasterPlanPage() {
  return (
    <main className="min-h-screen bg-muted px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl">
        <PlanPageHeader mode="create" />
        <PMMasterPlanForm />
      </div>
    </main>
  );
}
