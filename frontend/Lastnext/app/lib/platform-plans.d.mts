export type PlatformPlan = {
  code?: string;
  name?: string;
  monthly_price?: string | number;
  billing_interval?: string;
  max_properties?: number;
  max_users?: number;
  max_monthly_work_orders?: number;
  max_pm_schedules?: number;
  max_assets?: number;
  max_storage_mb?: number;
  features?: Record<string, boolean>;
};

export type PlatformFeature = {
  key: string;
  label: string;
  included?: boolean;
  comingSoon?: boolean;
};

export const PLATFORM_FEATURES: PlatformFeature[];
export function formatStorage(megabytes: unknown): string;
export function featureStatus(plan: PlatformPlan, feature: PlatformFeature): string;
export function usageDisplay(
  used: unknown,
  limit: unknown,
  options?: { storage?: boolean },
): { value: string; overLimit: boolean };
