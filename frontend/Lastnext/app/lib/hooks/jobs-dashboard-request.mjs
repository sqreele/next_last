const JOBS_DASHBOARD_PATH = '/api/jobs/dashboard/';

export function buildJobsDashboardUrl({ propertyId, page = 1, pageSize = 24, filters = {} }) {
  const canonicalPropertyId = String(propertyId || '').trim();
  if (!canonicalPropertyId) return null;

  const params = new URLSearchParams({
    property_id: canonicalPropertyId,
    page: String(page),
    page_size: String(pageSize),
  });
  for (const key of ['search', 'status', 'priority', 'date', 'ordering']) {
    const value = String(filters[key] || '').trim();
    if (value && value !== 'all') params.set(key, value);
  }
  return `${JOBS_DASHBOARD_PATH}?${params.toString()}`;
}

export function isJobsDashboardAbortError(error) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export function isCurrentJobsDashboardRequest({
  requestId,
  currentRequestId,
  requestPropertyId,
  currentPropertyId,
}) {
  return requestId === currentRequestId
    && String(requestPropertyId || '') === String(currentPropertyId || '');
}

export function assertJobsDashboardPropertyBoundary(jobs, propertyId) {
  const canonicalPropertyId = String(propertyId || '');
  if (!Array.isArray(jobs)) throw new Error('Jobs dashboard response is missing results.');
  if (jobs.some((job) => String(job?.property_id || '') !== canonicalPropertyId)) {
    throw new Error('Jobs response crossed the active Property boundary.');
  }
  return jobs;
}

export function getJobsDashboardDetailHref(jobId, propertyId) {
  const externalJobId = String(jobId || '').trim();
  const externalPropertyId = String(propertyId || '').trim();
  if (!externalJobId || !externalPropertyId) return null;
  return `/dashboard/jobs/${encodeURIComponent(externalJobId)}?property_id=${encodeURIComponent(externalPropertyId)}`;
}

export async function requestJobsDashboardPage({
  propertyId,
  page,
  pageSize,
  filters,
  signal,
  fetchImpl = fetch,
}) {
  const url = buildJobsDashboardUrl({ propertyId, page, pageSize, filters });
  if (!url) return null;
  const response = await fetchImpl(url, {
    signal,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Jobs dashboard returned an invalid response.');
    }
  }
  if (!response.ok) {
    const message = data.detail || data.error || `Unable to load jobs (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (String(data.property_id || '') !== String(propertyId)) {
    throw new Error('Jobs response did not match the active Property.');
  }
  assertJobsDashboardPropertyBoundary(data.results, propertyId);
  return data;
}
