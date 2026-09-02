export const INVENTORY_SEARCH_DEBOUNCE_MS = 300;

export function scheduleInventorySearch(
  value,
  onApply,
  {
    delay = INVENTORY_SEARCH_DEBOUNCE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {},
) {
  const timer = setTimer(() => onApply(value), delay);
  return () => clearTimer(timer);
}

export function buildInventoryListParams({
  propertyId,
  page,
  pageSize,
  category,
  status,
  room,
  lowStockOnly,
  job,
  preventiveMaintenance,
  search,
}) {
  const params = {
    page,
    page_size: pageSize,
    property_id: propertyId,
  };

  if (category !== "all") params.category = category;
  if (status !== "all") params.status = status;
  if (room !== "all") params.room_id = room;
  if (lowStockOnly) params.low_stock = "true";
  if (job !== "all") params.job_id = job;
  if (preventiveMaintenance !== "all") params.pm_id = preventiveMaintenance;
  if (search) params.search = search;

  return params;
}
