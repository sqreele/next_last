import PMMasterPlanForm from "@/app/components/preventive/PMMasterPlanForm";

export default function CreatePMMasterPlanPage() {
  return (
    <main className="min-h-screen bg-muted px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5">
          <p className="text-sm font-semibold text-purple-700">Recurring preventive maintenance</p>
          <h1 className="text-2xl font-bold text-foreground">Create PM master plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">The active property determines which machines can be included.</p>
        </div>
        <PMMasterPlanForm />
      </div>
    </main>
  );
}
