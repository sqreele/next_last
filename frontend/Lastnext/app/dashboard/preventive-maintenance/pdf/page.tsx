'use client';

import React from 'react';
import PDFMaintenanceGenerator from '@/app/components/document/PDFMaintenanceGenerator';

export default function PDFGeneratorPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PDFMaintenanceGenerator />
    </div>
  );
}