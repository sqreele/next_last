'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarClock, Repeat2, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { PageLoader } from '@/app/components/ui/loading';
import { useSession } from '@/app/lib/session.client';
import {
  preventiveMaintenanceService,
  setPreventiveMaintenanceServiceToken,
  type PMMasterPlan,
} from '@/app/lib/PreventiveMaintenanceService';
import type { PMDetail } from '@/app/lib/api/pm-contracts';
import PreventiveMaintenanceClient from './PreventiveMaintenanceClient';

type DetailLoaderProps = {
  pmId: string;
};

export default function PreventiveMaintenanceDetailLoader({ pmId }: DetailLoaderProps) {
  const router = useRouter();
  const isMasterPlanId = /^PMP[0-9A-F]+$/i.test(pmId);
  const { data: session, status } = useSession();
  const [maintenance, setMaintenance] = useState<PMDetail | null>(null);
  const [masterPlan, setMasterPlan] = useState<PMMasterPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/auth/login?returnTo=${encodeURIComponent(`/dashboard/preventive-maintenance/${pmId}/`)}`);
    }
  }, [pmId, router, status]);

  useEffect(() => {
    const accessToken = session?.user?.accessToken;
    if (status !== 'authenticated' || !accessToken) return;

    let active = true;
    setPreventiveMaintenanceServiceToken(accessToken);
    setLoading(true);
    setError(null);

    const detailRequest = isMasterPlanId
      ? preventiveMaintenanceService.getPMMasterPlans({ plan_id: pmId })
      : preventiveMaintenanceService.getPreventiveMaintenanceById(pmId);

    detailRequest
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Preventive maintenance record could not be loaded.');
        }
        if (isMasterPlanId) {
          const plans = response.data as PMMasterPlan[];
          const plan = plans.find((item) => item.plan_id.toLowerCase() === pmId.toLowerCase());
          if (!plan) throw new Error(`No projected maintenance plan found with ID: ${pmId}`);
          setMasterPlan(plan);
        } else if (!Array.isArray(response.data)) {
          setMaintenance(response.data);
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
  }, [isMasterPlanId, pmId, session?.user?.accessToken, status]);

  if (loading || status === 'loading' || (status === 'authenticated' && !session?.user?.accessToken)) {
    return <PageLoader />;
  }

  if (masterPlan) {
    const assignee = masterPlan.assigned_to_details;
    const assigneeName = [assignee?.first_name, assignee?.last_name].filter(Boolean).join(' ') || assignee?.username || 'Unassigned';
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800">Projected master plan</span>
            <h1 className="mt-2 text-2xl font-bold text-foreground">{masterPlan.title}</h1>
            <p className="text-sm text-muted-foreground">#{masterPlan.plan_id}</p>
          </div>
          <Button asChild variant="outline"><Link href="/dashboard/preventive-maintenance/schedule">View schedule</Link></Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5"><CalendarClock className="mb-3 h-5 w-5 text-primary" /><p className="text-xs font-semibold uppercase text-muted-foreground">Next due</p><p className="mt-1 font-semibold">{new Date(masterPlan.next_due_date || masterPlan.start_date).toLocaleString()}</p></div>
          <div className="rounded-xl border border-border bg-card p-5"><Repeat2 className="mb-3 h-5 w-5 text-primary" /><p className="text-xs font-semibold uppercase text-muted-foreground">Frequency</p><p className="mt-1 font-semibold capitalize">{masterPlan.frequency}{masterPlan.custom_days ? ` (${masterPlan.custom_days} days)` : ''}</p></div>
          <div className="rounded-xl border border-border bg-card p-5"><Wrench className="mb-3 h-5 w-5 text-primary" /><p className="text-xs font-semibold uppercase text-muted-foreground">Equipment</p><p className="mt-1 font-semibold">{masterPlan.machines?.map((machine) => machine.name || machine.machine_id).join(', ') || 'No equipment'}</p></div>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">Assigned to</dt><dd className="font-medium">{assigneeName}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Status</dt><dd className="font-medium">{masterPlan.active ? 'Active' : 'Inactive'}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Task template</dt><dd className="font-medium">{masterPlan.procedure_template_name || 'Not set'}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Lead time</dt><dd className="font-medium">{masterPlan.lead_time_days} days</dd></div>
          </dl>
          {masterPlan.notes && <div className="mt-5 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap">{masterPlan.notes}</p></div>}
          {masterPlan.procedure && <div className="mt-5 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Procedure</p><p className="mt-1 whitespace-pre-wrap">{masterPlan.procedure}</p></div>}
        </div>
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30">
          <h2 className="font-bold text-blue-950 dark:text-blue-100">Record maintenance work and photos</h2>
          <p className="mt-2 text-sm text-blue-900 dark:text-blue-200">
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
              <span className="text-sm font-medium capitalize text-blue-800 dark:text-blue-200">
                Status: {masterPlan.generated_pm_status || 'pending'}
              </span>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-sm font-medium text-blue-900 dark:bg-black/20 dark:text-blue-100">
              No work form has been generated yet. It will become available before the next due date according to the lead time above.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error || !maintenance) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-xl items-center px-4 py-12">
        <div className="w-full rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-600" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Unable to load maintenance details
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{error}</p>
          <Button asChild className="mt-5">
            <Link href="/dashboard/preventive-maintenance/">Back to preventive maintenance</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl">
      <h1 className="mb-4 text-2xl font-bold">Preventive Maintenance Details</h1>
      <PreventiveMaintenanceClient maintenanceData={maintenance} />
    </div>
  );
}
