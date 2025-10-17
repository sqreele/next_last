'use client';

import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

// ✅ PERFORMANCE: Lazy load PDF generators to reduce initial bundle size
// These components are only loaded when needed (e.g., when user clicks export)

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

export const LazyJobPDFTemplate = dynamic(
  () => import('@/app/components/document/JobPDFTemplate'),
  {
    loading: () => (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Preparing PDF...</span>
      </div>
    ),
    ssr: false,
  }
);

export const LazyChartDashboardPDF = dynamic(
  () => import('@/app/components/document/ChartDashboardPDF'),
  {
    loading: () => (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Loading chart PDF...</span>
      </div>
    ),
    ssr: false,
  }
);

export const LazyJobsPDFGenerator = dynamic(
  () => import('@/app/components/document/JobsPDFGenerator'),
  {
    loading: () => (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Generating PDF...</span>
      </div>
    ),
    ssr: false,
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

export const LazyMaintenancePDFDocument = dynamic(
  () => import('@/app/components/pdf/MaintenancePDFDocument'),
  {
    loading: () => (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Loading document...</span>
      </div>
    ),
    ssr: false,
  }
);

