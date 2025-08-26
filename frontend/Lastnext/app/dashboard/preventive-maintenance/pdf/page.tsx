'use client';

import React from 'react';
import { useFilter } from '@/app/lib/FilterContext';
import PDFMaintenanceGenerator from '@/app/components/document/PDFMaintenanceGenerator';

export default function PDFGeneratorPage() {
  const { status, search } = useFilter();

  // ✅ Correct: The 'PDFMaintenanceGenerator' component accepts the initialFilters prop.
  return <PDFMaintenanceGenerator initialFilters={{ 
    status: status || 'all',
    frequency: 'all',
    search: search || '',
    startDate: '',
    endDate: '',
    machineId: '',
    page: 1,
    pageSize: 10
  }} />;
}