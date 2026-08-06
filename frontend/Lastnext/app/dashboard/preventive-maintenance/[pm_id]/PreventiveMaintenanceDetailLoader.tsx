'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { PageLoader } from '@/app/components/ui/loading';
import { useSession } from '@/app/lib/session.client';
import {
  preventiveMaintenanceService,
  setPreventiveMaintenanceServiceToken,
} from '@/app/lib/PreventiveMaintenanceService';
import type { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import PreventiveMaintenanceClient from './PreventiveMaintenanceClient';

type DetailLoaderProps = {
  pmId: string;
};

export default function PreventiveMaintenanceDetailLoader({ pmId }: DetailLoaderProps) {
  const router = useRouter();
  const isMasterPlanId = /^PMP[0-9A-F]+$/i.test(pmId);
  const { data: session, status } = useSession();
  const [maintenance, setMaintenance] = useState<PreventiveMaintenance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isMasterPlanId) {
      router.replace(
        `/dashboard/preventive-maintenance/schedule?plan_id=${encodeURIComponent(pmId)}`,
      );
      return;
    }
    if (status === 'unauthenticated') {
      router.replace(`/auth/login?returnTo=${encodeURIComponent(`/dashboard/preventive-maintenance/${pmId}/`)}`);
    }
  }, [isMasterPlanId, pmId, router, status]);

  useEffect(() => {
    if (isMasterPlanId) return;
    const accessToken = session?.user?.accessToken;
    if (status !== 'authenticated' || !accessToken) return;

    let active = true;
    setPreventiveMaintenanceServiceToken(accessToken);
    setLoading(true);
    setError(null);

    preventiveMaintenanceService
      .getPreventiveMaintenanceById(pmId)
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Preventive maintenance record could not be loaded.');
        }
        setMaintenance(response.data);
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

  if (isMasterPlanId || loading || status === 'loading' || (status === 'authenticated' && !session?.user?.accessToken)) {
    return <PageLoader />;
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
