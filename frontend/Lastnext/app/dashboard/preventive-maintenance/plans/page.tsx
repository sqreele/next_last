"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  createPreventiveMaintenanceService,
  type PMMasterPlan,
  type PMMasterPlanMaterializationResult,
  type PMMasterPlanProjection,
} from "@/app/lib/PreventiveMaintenanceService";
import { useSession } from "@/app/lib/session.client";
import { useMainStore } from "@/app/lib/stores/mainStore";
import { SkeletonList } from "@/app/components/ui/loading";

const readableFrequency = (frequency: string, customDays?: number | null) =>
  frequency === "custom"
    ? `Every ${customDays || "?"} days`
    : frequency.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const readableDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not scheduled";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function PMMasterPlansPage() {
  const { status } = useSession();
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const properties = useMainStore((state) => state.properties);
  const activeProperty = properties.find((property) => property.property_id === selectedPropertyId);
  const requestRef = useRef(0);
  const actionRequestRef = useRef(0);
  const requestedPropertyRef = useRef<string | null>(null);
  const [plans, setPlans] = useState<PMMasterPlan[]>([]);
  const [projection, setProjection] = useState<PMMasterPlanProjection | null>(null);
  const [canOperate, setCanOperate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletePlan, setDeletePlan] = useState<PMMasterPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [materializing, setMaterializing] = useState(false);
  const [materializationPreview, setMaterializationPreview] = useState<PMMasterPlanMaterializationResult | null>(null);
  const [materializationResult, setMaterializationResult] = useState<string | null>(null);
  const [loadedPropertyId, setLoadedPropertyId] = useState<string | null>(null);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const propertyChanged = requestedPropertyRef.current !== selectedPropertyId;
    requestedPropertyRef.current = selectedPropertyId;
    actionRequestRef.current += 1;
    if (propertyChanged) {
      setPlans([]);
      setProjection(null);
      setCanOperate(false);
      setLoadedPropertyId(null);
    }
    setDeletePlan(null);
    setDeleting(false);
    setMaterializing(false);
    setMaterializationPreview(null);
    setError(null);

    if (status !== "authenticated" || !selectedPropertyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const service = createPreventiveMaintenanceService();
    Promise.all([
      service.getPMMasterPlans({ property_id: selectedPropertyId }),
      service.getPMMasterPlanProjection(selectedPropertyId, 30),
      service.getMaintenanceStatistics({ property_id: selectedPropertyId }).catch(() => null),
    ])
      .then(([plansResponse, projectionResponse, statsResponse]) => {
        if (requestId !== requestRef.current) return;
        setPlans(plansResponse.success && Array.isArray(plansResponse.data) ? plansResponse.data : []);
        setProjection(projectionResponse.data || null);
        setCanOperate(statsResponse?.data?.can_operate === true);
        setLoadedPropertyId(selectedPropertyId);
      })
      .catch((requestError: unknown) => {
        if (requestId === requestRef.current) {
          setError(errorMessage(requestError, "Unable to load PM master plans."));
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });

    return () => {
      requestRef.current += 1;
    };
  }, [refreshKey, selectedPropertyId, status]);

  useEffect(() => {
    setMaterializationResult(null);
  }, [selectedPropertyId]);

  const nextProjectionByPlan = useMemo(() => {
    const values = new Map<string, PMMasterPlanProjection["items"][number]>();
    const scopedProjection = loadedPropertyId === selectedPropertyId ? projection : null;
    scopedProjection?.items.forEach((item) => {
      if (!values.has(item.plan_id)) values.set(item.plan_id, item);
    });
    return values;
  }, [loadedPropertyId, projection, selectedPropertyId]);

  const hasCurrentPropertyData = loadedPropertyId === selectedPropertyId;
  const scopedPlans = hasCurrentPropertyData ? plans : [];
  const scopedProjection = hasCurrentPropertyData ? projection : null;

  const reviewMaterialization = async () => {
    if (!selectedPropertyId) return;
    const requestPropertyId = selectedPropertyId;
    const actionRequestId = ++actionRequestRef.current;
    setMaterializing(true);
    setError(null);
    setMaterializationResult(null);
    try {
      const response = await createPreventiveMaintenanceService()
        .materializePMMasterPlans(true, requestPropertyId);
      if (actionRequestId !== actionRequestRef.current || useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      setMaterializationPreview(response.data || null);
    } catch (requestError: unknown) {
      if (actionRequestId !== actionRequestRef.current || useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      setError(errorMessage(requestError, "Unable to preview PM generation."));
    } finally {
      if (actionRequestId === actionRequestRef.current) setMaterializing(false);
    }
  };

  const confirmMaterialization = async () => {
    if (!selectedPropertyId) return;
    const requestPropertyId = selectedPropertyId;
    const actionRequestId = ++actionRequestRef.current;
    setMaterializing(true);
    setError(null);
    try {
      const response = await createPreventiveMaintenanceService()
        .materializePMMasterPlans(false, requestPropertyId);
      if (actionRequestId !== actionRequestRef.current || useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      const count = response.data?.created_count || 0;
      setMaterializationResult(`${count} PM work ${count === 1 ? "form was" : "forms were"} generated.`);
      setMaterializationPreview(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError: unknown) {
      if (actionRequestId !== actionRequestRef.current || useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      setError(errorMessage(requestError, "PM generation failed."));
    } finally {
      if (actionRequestId === actionRequestRef.current) setMaterializing(false);
    }
  };

  const confirmDelete = useCallback(async () => {
    if (!selectedPropertyId || !deletePlan) return;
    const requestPropertyId = selectedPropertyId;
    const actionRequestId = ++actionRequestRef.current;
    setDeleting(true);
    setError(null);
    try {
      await createPreventiveMaintenanceService()
        .deletePMMasterPlan(deletePlan.plan_id, requestPropertyId);
      if (actionRequestId !== actionRequestRef.current || useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      setDeletePlan(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError: unknown) {
      if (actionRequestId !== actionRequestRef.current || useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      setError(errorMessage(requestError, "Unable to delete this PM master plan."));
      setDeletePlan(null);
    } finally {
      if (actionRequestId === actionRequestRef.current) setDeleting(false);
    }
  }, [deletePlan, selectedPropertyId]);

  if (!selectedPropertyId) {
    return (
      <main className="min-h-screen bg-muted px-4 py-16">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold">Select a property</h1>
          <p className="mt-2 text-muted-foreground">Select a property to view PM master plans.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted px-3 py-4 sm:px-6 sm:py-6" aria-busy={loading || materializing || deleting}>
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-purple-700">{activeProperty?.name || selectedPropertyId}</p>
            <h1 className="text-2xl font-bold text-foreground">PM master plans</h1>
            <p className="mt-1 text-sm text-muted-foreground">Recurring rules that project and generate preventive-maintenance work.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard/preventive-maintenance/schedule" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 py-2 font-semibold"><CalendarClock className="mr-2 h-4 w-4" aria-hidden />Schedule</Link>
            {canOperate && <Link href="/dashboard/preventive-maintenance/plans/create" className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-semibold text-white"><Plus className="mr-2 h-4 w-4" aria-hidden />Create plan</Link>}
          </div>
        </header>

        {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800" role="alert">{error}</div>}
        {materializationResult && <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-4 text-green-900" role="status">{materializationResult}</div>}

        <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="projection-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="projection-heading" className="font-bold">Next 30 days</h2>
              <p className="text-sm text-muted-foreground">{scopedProjection ? `${scopedProjection.total} projected or generated occurrences` : loading ? "Loading projection…" : "Projection unavailable"}</p>
            </div>
            {canOperate && <button type="button" onClick={() => void reviewMaterialization()} disabled={materializing} className="inline-flex min-h-11 items-center justify-center rounded-md border border-purple-300 px-4 py-2 font-semibold text-purple-800 disabled:opacity-60"><RefreshCw className={`mr-2 h-4 w-4 ${materializing ? "animate-spin" : ""}`} aria-hidden />Review generation</button>}
          </div>
          {materializationPreview && (
            <div className="mt-4 rounded-lg border border-purple-300 bg-purple-50 p-4" role="alertdialog" aria-labelledby="materialize-confirm-title">
              <h3 id="materialize-confirm-title" className="font-bold text-purple-950">Generate {materializationPreview.created_count} PM work {materializationPreview.created_count === 1 ? "form" : "forms"}?</h3>
              <p className="mt-1 text-sm text-purple-900">Only due plans for the active property will be processed. Existing occurrences are skipped.</p>
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setMaterializationPreview(null)} className="min-h-11 rounded-md border border-purple-300 px-4 py-2 font-semibold">Cancel</button>
                <button type="button" onClick={() => void confirmMaterialization()} disabled={materializing || materializationPreview.created_count === 0} className="min-h-11 rounded-md bg-purple-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Generate work forms</button>
              </div>
            </div>
          )}
        </section>

        {error && !hasCurrentPropertyData ? null : (loading || status === "loading") && !hasCurrentPropertyData ? (
          <SkeletonList rows={4} />
        ) : scopedPlans.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <h2 className="text-lg font-bold">No PM master plans configured</h2>
            <p className="mt-2 text-muted-foreground">Create a recurring rule for one or more machines at this property.</p>
            {canOperate && <Link href="/dashboard/preventive-maintenance/plans/create" className="mt-5 inline-flex min-h-11 items-center rounded-md bg-blue-600 px-4 py-2 font-semibold text-white">Create first plan</Link>}
          </div>
        ) : (
          <section aria-label="PM master plans" className="grid gap-4 lg:grid-cols-2">
            {scopedPlans.map((plan) => {
              const nextProjection = nextProjectionByPlan.get(plan.plan_id);
              return (
                <article key={plan.plan_id} className="rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h2 className="truncate text-lg font-bold">{plan.title}</h2><p className="text-xs text-muted-foreground">#{plan.plan_id}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${plan.active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}>{plan.active ? "Active" : "Inactive"}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-muted-foreground">Frequency</dt><dd className="font-semibold">{readableFrequency(plan.frequency, plan.custom_days)}</dd></div>
                    <div><dt className="text-muted-foreground">Next due</dt><dd className="font-semibold">{readableDate(nextProjection?.scheduled_date || plan.next_due_date)}</dd></div>
                    <div><dt className="text-muted-foreground">Machines</dt><dd className="font-semibold">{plan.machines?.length || 0}</dd></div>
                    <div><dt className="text-muted-foreground">Procedure</dt><dd className="truncate font-semibold">{plan.procedure_template_name || "Not set"}</dd></div>
                  </dl>
                  <p className="mt-4 line-clamp-2 text-sm text-muted-foreground">{plan.machines?.map((machine) => machine.name || machine.machine_id).join(", ")}</p>
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
                    <Link href={`/dashboard/preventive-maintenance/${plan.plan_id}`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 py-2 font-semibold text-blue-700">View</Link>
                    {canOperate && <Link href={`/dashboard/preventive-maintenance/plans/${plan.plan_id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 py-2 font-semibold"><Pencil className="mr-2 h-4 w-4" aria-hidden />Edit</Link>}
                    {canOperate && <button type="button" onClick={() => setDeletePlan(plan)} className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-md border border-red-300 px-3 py-2 font-semibold text-red-700"><Trash2 className="mr-2 h-4 w-4" aria-hidden />Delete</button>}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {loading && hasCurrentPropertyData ? (
          <p className="mt-4 text-sm font-medium text-muted-foreground" role="status" aria-live="polite">Updating PM master plans…</p>
        ) : null}

        {deletePlan && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-3 sm:items-center sm:justify-center" role="presentation">
            <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="delete-plan-title">
              <h2 id="delete-plan-title" className="text-lg font-bold">Delete “{deletePlan.title}”?</h2>
              <p className="mt-2 text-sm text-muted-foreground">The recurring rule will be removed. PM work records already generated from it will be preserved.</p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setDeletePlan(null)} disabled={deleting} className="min-h-11 rounded-md border border-border px-4 py-2 font-semibold">Cancel</button>
                <button type="button" onClick={() => void confirmDelete()} disabled={deleting} className="min-h-11 rounded-md bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{deleting ? "Deleting…" : "Delete plan"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
