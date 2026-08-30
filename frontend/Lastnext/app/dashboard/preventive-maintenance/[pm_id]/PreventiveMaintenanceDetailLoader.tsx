'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Repeat2, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { FeedbackState } from '@/app/components/feedback/FeedbackState';
import { PageLoader } from '@/app/components/ui/loading';
import { useSession } from '@/app/lib/session.client';
import {
  setPreventiveMaintenanceServiceToken,
  createPreventiveMaintenanceService,
  type PMMasterPlan,
} from '@/app/lib/PreventiveMaintenanceService';
import type { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import PreventiveMaintenanceClient from './PreventiveMaintenanceClient';
import { useMainStore } from '@/app/lib/stores/mainStore';

type DetailLoaderProps = {
  pmId: string;
};

export default function PreventiveMaintenanceDetailLoader({ pmId }: DetailLoaderProps) {
  const router = useRouter();
  const isMasterPlanId = /^PMP[0-9A-F]+$/i.test(pmId);
  const { data: session, status } = useSession();
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const [maintenance, setMaintenance] = useState<PreventiveMaintenance | null>(null);
  const [masterPlan, setMasterPlan] = useState<PMMasterPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canOperate, setCanOperate] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/auth/login?returnTo=${encodeURIComponent(`/dashboard/preventive-maintenance/${pmId}/`)}`);
    }
  }, [pmId, router, status]);

  useEffect(() => {
    const accessToken = session?.user?.accessToken;
    if (status !== 'authenticated' || !accessToken) return;

    if (!selectedPropertyId) {
      setMaintenance(null);
      setMasterPlan(null);
      setCanOperate(false);
      setLoading(false);
      return;
    }

    let active = true;
    setPreventiveMaintenanceServiceToken(accessToken);
    setLoading(true);
    setError(null);
    setCanOperate(false);
    setMasterPlan(null);
    setMaintenance(null);
    const service = createPreventiveMaintenanceService(accessToken);
    const detailRequest = isMasterPlanId
      ? service.getPMMasterPlan(pmId, selectedPropertyId!)
      : service.getPreventiveMaintenanceById(pmId, selectedPropertyId!);

    detailRequest
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Preventive maintenance record could not be loaded.');
        }
        if (isMasterPlanId) {
          const plan = response.data as PMMasterPlan;
          setCanOperate(plan.can_operate === true);
          setMasterPlan(plan);
        } else {
          const record = response.data as PreventiveMaintenance;
          if (record.property_id !== selectedPropertyId) {
            throw new Error('This maintenance record is not available for the active property.');
          }
          setMaintenance(record);
        }
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        const message = requestError instanceof Error
          ? requestError.message
          : 'Preventive maintenance record could not be loaded.';
        setError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isMasterPlanId, pmId, selectedPropertyId, session?.user?.accessToken, status]);

  const deleteMasterPlan = async () => {
    const accessToken = session?.user?.accessToken;
    if (!accessToken || !selectedPropertyId || !masterPlan) return;
    const requestPropertyId = selectedPropertyId;
    setDeleting(true);
    setError(null);
    try {
      await createPreventiveMaintenanceService(accessToken)
        .deletePMMasterPlan(masterPlan.plan_id, requestPropertyId);
      if (useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      router.push('/dashboard/preventive-maintenance/plans');
      router.refresh();
    } catch (requestError: unknown) {
      if (useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete this PM master plan.');
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading || status === 'loading' || (status === 'authenticated' && !session?.user?.accessToken)) {
    return <PageLoader />;
  }

  if (!selectedPropertyId) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <FeedbackState
          variant="empty"
          title="Select a property"
          description="Select a property to view preventive maintenance details."
        />
      </div>
    );
  }

  if (masterPlan) {
    const assignee = masterPlan.assigned_to_details;
    const assigneeName = [assignee?.first_name, assignee?.last_name].filter(Boolean).join(' ') || assignee?.username || 'Unassigned';
    return (
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive" role="alert">{error}</div>}
        <header className="flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <span className="inline-flex min-h-7 items-center rounded-full border border-info/30 bg-info/10 px-3 py-1 text-xs font-semibold text-info">Projected master plan</span>
            <h1 className="mt-3 break-words text-2xl font-bold tracking-tight text-foreground md:text-3xl">{masterPlan.title}</h1>
            <p className="mt-1 break-all font-mono text-sm text-muted-foreground">#{masterPlan.plan_id}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:shrink-0">
            <Button asChild variant="outline"><Link href="/dashboard/preventive-maintenance/plans">All plans</Link></Button>
            <Button asChild variant="outline"><Link href="/dashboard/preventive-maintenance/schedule">View schedule</Link></Button>
            {canOperate && <Button asChild><Link href={`/dashboard/preventive-maintenance/plans/${masterPlan.plan_id}/edit`}>Edit plan</Link></Button>}
            {canOperate && <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>Delete</Button>}
          </div>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-soft"><span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-warning/10 text-warning-emphasis"><CalendarClock className="h-5 w-5" aria-hidden="true" /></span><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next due</p><p className="mt-1 break-words font-semibold text-foreground">{new Date(masterPlan.next_due_date || masterPlan.start_date).toLocaleString()}</p></div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-soft"><span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-info/10 text-info"><Repeat2 className="h-5 w-5" aria-hidden="true" /></span><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frequency</p><p className="mt-1 break-words font-semibold capitalize text-foreground">{masterPlan.frequency}{masterPlan.custom_days ? ` (${masterPlan.custom_days} days)` : ''}</p></div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-soft"><span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-5 w-5" aria-hidden="true" /></span><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipment</p><p className="mt-1 break-words font-semibold text-foreground">{masterPlan.machines?.map((machine) => machine.name || machine.machine_id).join(', ') || 'No equipment'}</p></div>
        </div>
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft" aria-label="Master plan details">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">Assigned to</dt><dd className="font-medium">{assigneeName}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Status</dt><dd className="mt-1 inline-flex items-center gap-2 font-medium"><span className={`h-2 w-2 rounded-full ${masterPlan.active ? 'bg-success' : 'bg-muted-foreground'}`} aria-hidden="true" />{masterPlan.active ? 'Active' : 'Inactive'}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Task template</dt><dd className="font-medium">{masterPlan.procedure_template_name || 'Not set'}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Lead time</dt><dd className="font-medium">{masterPlan.lead_time_days} days</dd></div>
          </dl>
          {masterPlan.notes && <div className="mt-5 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap">{masterPlan.notes}</p></div>}
          {masterPlan.procedure && <div className="mt-5 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Procedure</p><p className="mt-1 whitespace-pre-wrap">{masterPlan.procedure}</p></div>}
        </section>
        <section className="rounded-xl border border-info/30 bg-info/10 p-5" aria-labelledby="work-form-title">
          <h2 id="work-form-title" className="font-bold text-foreground">Record maintenance work and photos</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Before and After photos belong to each generated PM work form, not to this recurring master plan.
            The system generates that form when the occurrence enters its {masterPlan.lead_time_days}-day lead window.
          </p>
          {masterPlan.generated_pm_id ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href={`/dashboard/preventive-maintenance/edit/${masterPlan.generated_pm_id}?complete=true`}>
                  Open work form · #{masterPlan.generated_pm_id}
                </Link>
              </Button>
              <span className="text-sm font-medium capitalize text-info">
                Status: {masterPlan.generated_pm_status || 'pending'}
              </span>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-info/20 bg-background/70 px-4 py-3 text-sm font-medium text-foreground">
              No work form has been generated yet. It will become available before the next due date according to the lead time above.
            </p>
          )}
        </section>
        {confirmingDelete && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5" role="alertdialog" aria-labelledby="delete-master-plan-title">
            <h2 id="delete-master-plan-title" className="font-bold text-foreground">Delete this recurring plan?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Generated PM work records will be preserved, but no new work will be projected from this rule.</p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" onClick={() => void deleteMasterPlan()} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete plan'}</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error || !maintenance) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl items-center px-4 py-12 sm:px-6">
        <FeedbackState
          variant="error"
          title="Unable to load maintenance details"
          description={error || "The maintenance record is unavailable."}
          action={<Button asChild><Link href="/dashboard/preventive-maintenance/">Back to preventive maintenance</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Maintenance record</p>
      <PreventiveMaintenanceClient maintenanceData={maintenance} />
    </div>
  );
}
