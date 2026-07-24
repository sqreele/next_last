"use client";

import React from "react";
import PreventiveMaintenanceDashboard from "@/app/components/preventive/PreventiveMaintenanceDashboard";

export default function PreventiveMaintenanceDashboardPage() {
  return (
    <div className="bg-muted min-h-screen">
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
        <PreventiveMaintenanceDashboard />
      </div>
    </div>
  );
}
