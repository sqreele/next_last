import type { NavigationGroup, NavigationItem, PlanFeature } from "@/app/design-system/navigation-config";

export type PlanCapabilities = Record<PlanFeature, boolean>;
export function canUseFeature(features: Partial<PlanCapabilities> | null | undefined, feature: PlanFeature): boolean;
export function filterPlanNavigationItems<T extends NavigationItem>(items: readonly T[], features: Partial<PlanCapabilities> | null | undefined): T[];
export function filterPlanNavigationGroups<T extends NavigationGroup>(groups: readonly T[], features: Partial<PlanCapabilities> | null | undefined): Array<T & { items: NavigationItem[] }>;
