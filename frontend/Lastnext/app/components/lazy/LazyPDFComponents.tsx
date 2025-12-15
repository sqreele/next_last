'use client';

import dynamic from 'next/dynamic';

// ✅ PERFORMANCE: Lazy load PDF generators to reduce initial bundle size
// These components are only loaded when needed (e.g., when user clicks export)
// Note: Uses jsPDF/html2canvas for PDF generation (lightweight alternative)

export const LazyMaintenancePDFGenerator = dynamic(
  () => import('@/app/components/MaintenancePDFGenerator'),
  {
    loading: () => (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Loading PDF generator...</span>
      </div>
    ),
    ssr: false, // PDFs should only be generated client-side
  }
);

export const LazyPDFMaintenanceGenerator = dynamic(
  () => import('@/app/components/document/PDFMaintenanceGenerator'),
  {
    loading: () => (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Loading maintenance PDF...</span>
      </div>
    ),
    ssr: false,
  }
);

