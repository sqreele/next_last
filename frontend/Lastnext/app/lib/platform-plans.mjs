export const PLATFORM_FEATURES = [
  { key: "maintenance_jobs", label: "Maintenance jobs", included: true },
  { key: "photo_attachments", label: "Photo attachments", included: true },
  { key: "room_history", label: "Room history", included: true },
  { key: "equipment_history", label: "Equipment history", included: true },
  { key: "preventive_maintenance", label: "Preventive maintenance" },
  { key: "pm_schedules", label: "PM schedules" },
  { key: "technician_kpi", label: "Technician KPI" },
  { key: "advanced_reports", label: "Advanced reports" },
  { key: "csv_export", label: "CSV export" },
  { key: "multi_property", label: "Multi-property" },
  { key: "advanced_property_permissions", label: "Advanced property permissions" },
  { key: "portfolio_dashboard", label: "Portfolio dashboard", comingSoon: true },
];

export function formatStorage(megabytes) {
  if (megabytes == null || Number.isNaN(Number(megabytes))) return "—";
  const gigabytes = Number(megabytes) / 1024;
  return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} GB`;
}

export function featureStatus(plan, feature) {
  if (feature.comingSoon) return "Coming soon";
  if (feature.included) return "✓ Available";
  return plan?.features?.[feature.key] === true ? "✓ Available" : "— Not available";
}

export function usageDisplay(used, limit, options = {}) {
  if (used == null || limit == null) return { value: "—", overLimit: false };
  const format = options.storage ? formatStorage : (value) => String(value);
  return {
    value: `${format(used)} / ${format(limit)}`,
    overLimit: Number(used) > Number(limit),
  };
}
