'use client';

import React from 'react';
import PDFMaintenanceGenerator from '@/app/components/document/PDFMaintenanceGenerator';
import { PreventiveMaintenanceProvider } from '@/app/lib/PreventiveContext';

export default function PDFGeneratorPage() {
  return (
    <PreventiveMaintenanceProvider>
      <div className="min-h-screen bg-gray-50">
        <PDFMaintenanceGenerator />
      </div>
    </PreventiveMaintenanceProvider>
  );
}