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
  createPreventiveMaintenanceService,
  type PMMasterPlan,
} from '@/app/lib/PreventiveMaintenanceService';
import type { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import PreventiveMaintenanceClient from './PreventiveMaintenanceClient';
import { useMainStore } from '@/app/lib/stores/mainStore';
import { useLocale } from '@/app/lib/i18n/LocaleProvider';
import type { DictKey } from '@/app/lib/i18n/dictionary';
import { StatusBadge } from '@/app/components/StatusBadge';

type DetailLoaderProps = {
  pmId: string;
};

const RECORD_LOAD_FAILED = 'pm-detail:record-load-failed';
const PROPERTY_MISMATCH = 'pm-detail:property-mismatch';
const PLAN_DELETE_FAILED = 'pm-detail:plan-delete-failed';

export default function PreventiveMaintenanceDetailLoader({ pmId }: DetailLoaderProps) {
  const { locale, t } = useLocale();
  const dateLocale = locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-US';
  const router = useRouter();
  const isMasterPlanId = /^PMP[0-9A-F]+$/i.test(pmId);
  const { status } = useSession();
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
    if (status !== 'authenticated') return;

    if (!selectedPropertyId) {
      setMaintenance(null);
      setMasterPlan(null);
      setCanOperate(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setCanOperate(false);
    setMasterPlan(null);
    setMaintenance(null);
    const service = createPreventiveMaintenanceService();
    const detailRequest = isMasterPlanId
      ? service.getPMMasterPlan(pmId, selectedPropertyId!)
      : service.getPreventiveMaintenanceById(pmId, selectedPropertyId!);

    detailRequest
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) {
          throw new Error(response.message || RECORD_LOAD_FAILED);
        }
        if (isMasterPlanId) {
          const plan = response.data as PMMasterPlan;
          setCanOperate(plan.can_operate === true);
          setMasterPlan(plan);
        } else {
          const record = response.data as PreventiveMaintenance;
          if (record.property_id !== selectedPropertyId) {
            throw new Error(PROPERTY_MISMATCH);
          }
          setMaintenance(record);
        }
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        const message = requestError instanceof Error
          ? requestError.message
          : RECORD_LOAD_FAILED;
        setError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isMasterPlanId, pmId, selectedPropertyId, status]);

  const deleteMasterPlan = async () => {
    if (!selectedPropertyId || !masterPlan) return;
    const requestPropertyId = selectedPropertyId;
    setDeleting(true);
    setError(null);
    try {
      await createPreventiveMaintenanceService()
        .deletePMMasterPlan(masterPlan.plan_id, requestPropertyId);
      if (useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      router.push('/dashboard/preventive-maintenance/plans');
      router.refresh();
    } catch (requestError: unknown) {
      if (useMainStore.getState().selectedPropertyId !== requestPropertyId) return;
      setError(requestError instanceof Error ? requestError.message : PLAN_DELETE_FAILED);
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading || status === 'loading') {
    return <PageLoader />;
  }

  const localizedError = error === RECORD_LOAD_FAILED
    ? t('pmDetail.recordLoadFailed')
    : error === PROPERTY_MISMATCH
      ? t('pmDetail.propertyMismatch')
      : error === PLAN_DELETE_FAILED
        ? t('pmDetail.plan.deleteError')
        : error;

  if (!selectedPropertyId) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <FeedbackState
          variant="empty"
          title={t('common.selectProperty')}
          description={t('pmDetail.selectPropertyHint')}
        />
      </div>
    );
  }

  if (masterPlan) {
    const assignee = masterPlan.assigned_to_details;
    const assigneeName = [assignee?.first_name, assignee?.last_name].filter(Boolean).join(' ') || assignee?.username || t('pmDetail.unknownTechnician');
    const frequencyKeys: Record<string, DictKey> = {
      daily: 'pm.frequency.daily', weekly: 'pm.frequency.weekly', monthly: 'pm.frequency.monthly',
      quarterly: 'pm.frequency.quarterly', semi_annual: 'pm.frequency.semiAnnual',
      annual: 'pm.frequency.annual', custom: 'pm.frequency.custom',
    };
    const frequencyLabel = frequencyKeys[masterPlan.frequency]
      ? t(frequencyKeys[masterPlan.frequency])
      : masterPlan.frequency;
    return (
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {localizedError && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive" role="alert">{localizedError}</div>}
        <header className="flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <span className="inline-flex min-h-7 items-center rounded-full border border-info/30 bg-info/10 px-3 py-1 text-xs font-semibold text-info">{t('pmDetail.plan.projected')}</span>
            <h1 className="mt-3 break-words text-2xl font-bold tracking-tight text-foreground md:text-3xl">{masterPlan.title}</h1>
            <p className="mt-1 break-all font-mono text-sm text-muted-foreground">#{masterPlan.plan_id}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:shrink-0">
            <Button asChild variant="outline"><Link href="/dashboard/preventive-maintenance/plans">{t('pmDetail.plan.all')}</Link></Button>
            <Button asChild variant="outline"><Link href="/dashboard/preventive-maintenance/schedule">{t('pmDetail.plan.viewSchedule')}</Link></Button>
            {canOperate && <Button asChild><Link href={`/dashboard/preventive-maintenance/plans/${masterPlan.plan_id}/edit`}>{t('pmDetail.plan.edit')}</Link></Button>}
            {canOperate && <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>{t('action.delete')}</Button>}
          </div>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-soft"><span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-warning/10 text-warning-emphasis"><CalendarClock className="h-5 w-5" aria-hidden="true" /></span><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('pmDetail.plan.nextDue')}</p><p className="mt-1 break-words font-semibold text-foreground">{new Date(masterPlan.next_due_date || masterPlan.start_date).toLocaleString(dateLocale)}</p></div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-soft"><span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-info/10 text-info"><Repeat2 className="h-5 w-5" aria-hidden="true" /></span><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('pmDetail.plan.frequency')}</p><p className="mt-1 break-words font-semibold text-foreground">{frequencyLabel}{masterPlan.custom_days ? ` (${t('pmDetail.plan.days', { count: masterPlan.custom_days })})` : ''}</p></div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-soft"><span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-5 w-5" aria-hidden="true" /></span><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('pmDetail.plan.equipment')}</p><p className="mt-1 break-words font-semibold text-foreground">{masterPlan.machines?.map((machine) => machine.name || machine.machine_id).join(', ') || t('pmDetail.plan.noEquipment')}</p></div>
        </div>
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft" aria-label={t('pmDetail.plan.details')}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">{t('pmDetail.assignedTo')}</dt><dd className="font-medium">{assigneeName}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{t('pmDetail.plan.status')}</dt><dd className="mt-1 inline-flex items-center gap-2 font-medium"><span className={`h-2 w-2 rounded-full ${masterPlan.active ? 'bg-success' : 'bg-muted-foreground'}`} aria-hidden="true" />{masterPlan.active ? t('pmDetail.plan.active') : t('pmDetail.plan.inactive')}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{t('pm.taskTemplate')}</dt><dd className="font-medium">{masterPlan.procedure_template_name || t('common.notAvailable')}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{t('pmDetail.plan.leadTime')}</dt><dd className="font-medium">{t('pmDetail.plan.days', { count: masterPlan.lead_time_days })}</dd></div>
          </dl>
          {masterPlan.notes && <div className="mt-5 border-t border-border pt-4"><p className="text-sm text-muted-foreground">{t('pmDetail.notes')}</p><p className="mt-1 whitespace-pre-wrap">{masterPlan.notes}</p></div>}
          {masterPlan.procedure && <div className="mt-5 border-t border-border pt-4"><p className="text-sm text-muted-foreground">{t('pmDetail.procedure')}</p><p className="mt-1 whitespace-pre-wrap">{masterPlan.procedure}</p></div>}
        </section>
        <section className="rounded-xl border border-info/30 bg-info/10 p-5" aria-labelledby="work-form-title">
          <h2 id="work-form-title" className="font-bold text-foreground">{t('pmDetail.plan.workFormTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('pmDetail.plan.workFormHint', { days: masterPlan.lead_time_days })}
          </p>
          {masterPlan.generated_pm_id ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href={`/dashboard/preventive-maintenance/edit/${masterPlan.generated_pm_id}?complete=true`}>
                  {t('pmDetail.plan.openWorkForm', { id: masterPlan.generated_pm_id })}
                </Link>
              </Button>
              <span className="text-sm font-medium capitalize text-info">
                <StatusBadge status={masterPlan.generated_pm_status || 'pending'} />
              </span>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-info/20 bg-background/70 px-4 py-3 text-sm font-medium text-foreground">
              {t('pmDetail.plan.noWorkForm')}
            </p>
          )}
        </section>
        {confirmingDelete && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5" role="alertdialog" aria-labelledby="delete-master-plan-title">
            <h2 id="delete-master-plan-title" className="font-bold text-foreground">{t('pmDetail.plan.deleteTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('pmDetail.plan.deleteHint')}</p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t('action.cancel')}</Button>
              <Button variant="destructive" onClick={() => void deleteMasterPlan()} disabled={deleting}>{deleting ? t('pmDetail.deleting') : t('pmDetail.plan.delete')}</Button>
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
          title={t('pmDetail.loadError')}
          description={localizedError || t('pmDetail.unavailable')}
          action={<Button asChild><Link href="/dashboard/preventive-maintenance/">{t('pmDetail.backToPm')}</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{t('pmDetail.record')}</p>
      <PreventiveMaintenanceClient maintenanceData={maintenance} />
    </div>
  );
}
