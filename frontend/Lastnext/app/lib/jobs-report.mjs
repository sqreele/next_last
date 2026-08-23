const FILTER_PARAM_MAP = {
  status: "status",
  priority: "priority",
  pm: "pm",
  topic: "topic",
  user: "user",
  month: "month",
  year: "year",
  createdFrom: "created_from",
  createdTo: "created_to",
  search: "search",
};

export function buildJobsReportParams({ propertyId, filters = {} }) {
  const normalizedPropertyId = String(propertyId || "").trim();
  if (!normalizedPropertyId) return null;

  const params = new URLSearchParams({ property_id: normalizedPropertyId });
  for (const [filterKey, queryKey] of Object.entries(FILTER_PARAM_MAP)) {
    const value = String(filters[filterKey] ?? "").trim();
    if (value && value !== "all") params.set(queryKey, value);
  }
  return params;
}

export function buildJobsReportCsvUrl(options) {
  const params = buildJobsReportParams(options);
  return params ? `/api/jobs/report-csv?${params.toString()}` : null;
}

export function assertJobsReportPropertyBoundary(jobs, propertyId) {
  const expected = String(propertyId || "");
  const crossed = jobs.some(
    (job) => String(job?.property_id || "") !== expected,
  );
  if (crossed) {
    throw new Error("Jobs Report crossed the active Property boundary.");
  }
  return jobs;
}

export function isCurrentJobsReportRequest({
  requestId,
  currentRequestId,
  requestPropertyId,
  currentPropertyId,
}) {
  return (
    requestId === currentRequestId &&
    String(requestPropertyId || "") === String(currentPropertyId || "")
  );
}

export function getJobsReportDetailHref(jobId, propertyId) {
  const normalizedJobId = String(jobId || "").trim();
  const normalizedPropertyId = String(propertyId || "").trim();
  if (!normalizedJobId || !normalizedPropertyId) return null;
  return `/dashboard/jobs/${encodeURIComponent(normalizedJobId)}?property_id=${encodeURIComponent(normalizedPropertyId)}`;
}

export function canExportJobsReport({ propertyId, rowCount, exporting }) {
  return Boolean(propertyId) && Number(rowCount) > 0 && exporting !== true;
}

export function getCsvFilename(contentDisposition, fallback) {
  const match = String(contentDisposition || "").match(
    /filename\*?=(?:UTF-8''|["']?)([^"';\r\n]+)/i,
  );
  return match?.[1] ? decodeURIComponent(match[1].trim()) : fallback;
}
