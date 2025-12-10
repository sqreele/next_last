'use client';

import React from 'react';
import PreventiveMaintenanceDashboard from '@/app/components/preventive/PreventiveMaintenanceDashboard';

export default function PreventiveMaintenanceDashboardPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <PreventiveMaintenanceDashboard />
      </div>
    </div>
  );
}