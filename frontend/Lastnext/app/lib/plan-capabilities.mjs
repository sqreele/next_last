export const PLAN_FEATURES = [
  "preventive_maintenance",
  "pm_schedules",
  "technician_kpi",
  "advanced_reports",
  "csv_export",
  "multi_property",
  "advanced_property_permissions",
  "portfolio_dashboard",
];

export function canUseFeature(features, feature) {
  return features?.[feature] === true;
}

export function filterPlanNavigationItems(items, features) {
  return items.filter(
    (item) => !item.requiredFeature || canUseFeature(features, item.requiredFeature),
  );
}

export function filterPlanNavigationGroups(groups, features) {
  return groups
    .map((group) => ({
      ...group,
      items: filterPlanNavigationItems(group.items, features),
    }))
    .filter((group) => group.items.length > 0);
}
