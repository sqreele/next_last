'use client';

import React from 'react';
import { PreventiveMaintenanceProvider } from '@/app/lib/PreventiveContext';
import PreventiveMaintenanceDashboard from '@/app/components/preventive/PreventiveMaintenanceDashboard';

export default function PreventiveMaintenanceDashboardPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <PreventiveMaintenanceProvider>
        <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-8">Preventive Maintenance Dashboard</h1>
          <PreventiveMaintenanceDashboard />
        </div>
      </PreventiveMaintenanceProvider>
    </div>
  );
}