"use client";

import dynamic from "next/dynamic";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";

// ✅ PERFORMANCE: Lazy load chart components (recharts is heavy ~150KB)
// Only load when charts are actually displayed

export const LazyLineChart = dynamic(
  () => import("recharts").then((mod) => ({ default: mod.LineChart })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse bg-gray-200 rounded-sm w-full h-full"></div>
      </div>
    ),
    ssr: false, // Charts should be client-side only
  },
);

export const LazyBarChart = dynamic(
  () => import("recharts").then((mod) => ({ default: mod.BarChart })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse bg-gray-200 rounded-sm w-full h-full"></div>
      </div>
    ),
    ssr: false,
  },
);

export const LazyPieChart = dynamic(
  () => import("recharts").then((mod) => ({ default: mod.PieChart })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse bg-gray-200 rounded-sm w-full h-full"></div>
      </div>
    ),
    ssr: false,
  },
);

export const LazyAreaChart = dynamic(
  () => import("recharts").then((mod) => ({ default: mod.AreaChart })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse bg-gray-200 rounded-sm w-full h-full"></div>
      </div>
    ),
    ssr: false,
  },
);

// ✅ PERFORMANCE: Lazy load the entire PropertyJobsDashboard which uses charts
export const LazyPropertyJobsDashboard = dynamic(
  () => import("@/app/components/jobs/PropertyJobsDashboard"),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <BouncingDotsLoader size="md" label="Loading dashboard..." className="text-sm text-muted-foreground" />
      </div>
    ),
    ssr: false,
  },
);
