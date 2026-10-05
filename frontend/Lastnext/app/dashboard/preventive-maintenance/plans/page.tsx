"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  createPreventiveMaintenanceService,
  type PMMasterPlan,
  type PMMasterPlanMaterializationResult,
  type PMMasterPlanProjection,
} from "@/app/lib/PreventiveMaintenanceService";
import { useSession } from "@/app/lib/session.client";
import { useMainStore } from "@/app/lib/stores/mainStore";
import { PageLoader } from "@/app/components/ui/loading";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

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
  const [canManagePMMaster, setCanManagePMMaster] = useState(false);
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
      setCanManagePMMaster(false);
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
        setCanManagePMMaster(statsResponse?.data?.can_manage_pm_master === true);
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

  if ((loading || status === "loading") && !hasCurrentPropertyData) {
    return (
      <PageLoader
        label="Loading PM master plans"
        description="Preparing recurring maintenance rules and projections."
      />
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
            {canManagePMMaster && <Link href="/dashboard/preventive-maintenance/plans/create" className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-semibold text-white"><Plus className="mr-2 h-4 w-4" aria-hidden />Create plan</Link>}
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
            {canManagePMMaster && <button type="button" onClick={() => void reviewMaterialization()} disabled={materializing} className="inline-flex min-h-11 items-center justify-center rounded-md border border-purple-300 px-4 py-2 font-semibold text-purple-800 disabled:opacity-60"><RefreshCw className={`mr-2 h-4 w-4 ${materializing ? "animate-spin" : ""}`} aria-hidden />Review generation</button>}
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

        {error && !hasCurrentPropertyData ? null : scopedPlans.length === 0 ? (
          <FeedbackState
            title="No PM master plans configured"
            description="Create a recurring rule for one or more machines at this property."
            action={canManagePMMaster ? <Link href="/dashboard/preventive-maintenance/plans/create" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">Create first plan</Link> : undefined}
          />
        ) : (
          <section aria-label="PM master plans" className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <div className="hidden border-b border-border bg-muted/50 px-5 py-3 lg:block">
              <div className="grid grid-cols-[minmax(12rem,1.4fr)_0.7fr_0.9fr_1fr_1.1fr_1.1fr_8.5rem] items-center gap-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Plan</span>
                <span>Status</span>
                <span>Frequency</span>
                <span>Next due</span>
                <span>Machines</span>
                <span>Procedure</span>
                <span className="text-right">Actions</span>
              </div>
            </div>

            <ul className="divide-y divide-border">
              {scopedPlans.map((plan) => {
                const nextProjection = nextProjectionByPlan.get(plan.plan_id);
                const machineNames = plan.machines
                  ?.map((machine) => machine.name || machine.machine_id)
                  .join(", ");
                const nextDue = readableDate(nextProjection?.scheduled_date || plan.next_due_date);

                return (
                  <li key={plan.plan_id} className="px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5">
                    <article>
                      <div className="lg:hidden">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/preventive-maintenance/${plan.plan_id}`}
                              className="font-semibold text-foreground hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {plan.title}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">#{plan.plan_id}</p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${plan.active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${plan.active ? "bg-green-600" : "bg-muted-foreground"}`} aria-hidden />
                            {plan.active ? "Active" : "Inactive"}
                          </span>
                        </div>

                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                          <div className="flex min-w-0 gap-2">
                            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div><dt className="text-xs text-muted-foreground">Frequency</dt><dd className="font-medium">{readableFrequency(plan.frequency, plan.custom_days)}</dd></div>
                          </div>
                          <div className="flex min-w-0 gap-2">
                            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div><dt className="text-xs text-muted-foreground">Next due</dt><dd className="font-medium">{nextDue}</dd></div>
                          </div>
                          <div className="flex min-w-0 gap-2">
                            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Machines ({plan.machines?.length || 0})</dt><dd className="truncate font-medium">{machineNames || "No machines assigned"}</dd></div>
                          </div>
                          <div className="flex min-w-0 gap-2">
                            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Procedure</dt><dd className="truncate font-medium">{plan.procedure_template_name || "Not set"}</dd></div>
                          </div>
                        </dl>

                        <div className="mt-4 flex items-center justify-end gap-1 border-t border-border/70 pt-3">
                          <Link href={`/dashboard/preventive-maintenance/${plan.plan_id}`} className="grid h-11 w-11 place-items-center rounded-lg text-primary hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" title="View plan" aria-label={`View ${plan.title}`}><Eye className="h-4 w-4" aria-hidden /></Link>
                          {canManagePMMaster && <Link href={`/dashboard/preventive-maintenance/plans/${plan.plan_id}/edit`} className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" title="Edit plan" aria-label={`Edit ${plan.title}`}><Pencil className="h-4 w-4" aria-hidden /></Link>}
                          {canManagePMMaster && <button type="button" onClick={() => setDeletePlan(plan)} className="grid h-11 w-11 place-items-center rounded-lg text-red-600 hover:bg-red-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" title="Delete plan" aria-label={`Delete ${plan.title}`}><Trash2 className="h-4 w-4" aria-hidden /></button>}
                        </div>
                      </div>

                      <div className="hidden grid-cols-[minmax(12rem,1.4fr)_0.7fr_0.9fr_1fr_1.1fr_1.1fr_8.5rem] items-center gap-4 lg:grid">
                        <div className="min-w-0">
                          <Link href={`/dashboard/preventive-maintenance/${plan.plan_id}`} className="block truncate text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" title={plan.title}>{plan.title}</Link>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">#{plan.plan_id}</p>
                        </div>
                        <div>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${plan.active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${plan.active ? "bg-green-600" : "bg-muted-foreground"}`} aria-hidden />
                            {plan.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{readableFrequency(plan.frequency, plan.custom_days)}</p>
                        <p className="text-sm text-foreground">{nextDue}</p>
                        <div className="min-w-0 text-sm">
                          <p className="font-medium">{plan.machines?.length || 0} {(plan.machines?.length || 0) === 1 ? "machine" : "machines"}</p>
                          <p className="truncate text-xs text-muted-foreground" title={machineNames}>{machineNames || "None assigned"}</p>
                        </div>
                        <p className="truncate text-sm text-foreground" title={plan.procedure_template_name || "Not set"}>{plan.procedure_template_name || "Not set"}</p>
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/preventive-maintenance/${plan.plan_id}`} className="grid h-10 w-10 place-items-center rounded-lg text-primary hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" title="View plan" aria-label={`View ${plan.title}`}><Eye className="h-4 w-4" aria-hidden /></Link>
                          {canManagePMMaster && <Link href={`/dashboard/preventive-maintenance/plans/${plan.plan_id}/edit`} className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" title="Edit plan" aria-label={`Edit ${plan.title}`}><Pencil className="h-4 w-4" aria-hidden /></Link>}
                          {canManagePMMaster && <button type="button" onClick={() => setDeletePlan(plan)} className="grid h-10 w-10 place-items-center rounded-lg text-red-600 hover:bg-red-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" title="Delete plan" aria-label={`Delete ${plan.title}`}><Trash2 className="h-4 w-4" aria-hidden /></button>}
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
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
