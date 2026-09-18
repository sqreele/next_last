'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { PropertyCsvImport } from '@/app/components/properties/PropertyCsvImport';
import { PropertyExportButton } from '@/app/components/properties/PropertyExportButton';
import { usePlanCapabilities } from '@/app/lib/hooks/usePlanCapabilities';

export function PropertiesToolbar() {
  const router = useRouter();
  const { canUseFeature } = usePlanCapabilities();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PropertyExportButton />
      {canUseFeature('multi_property') ? <PropertyCsvImport onImported={() => router.refresh()} /> : null}
    </div>
  );
}
