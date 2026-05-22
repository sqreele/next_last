'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { PropertyCsvImport } from '@/app/components/properties/PropertyCsvImport';
import { PropertyExportButton } from '@/app/components/properties/PropertyExportButton';

export function PropertiesToolbar() {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PropertyExportButton />
      <PropertyCsvImport onImported={() => router.refresh()} />
    </div>
  );
}
