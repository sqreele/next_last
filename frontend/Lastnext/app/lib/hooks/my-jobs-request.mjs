const MY_JOBS_PATH = '/api/jobs/my-jobs/';

export function buildMyJobsUrl({ propertyId, page = 1, pageSize = 24, filters = {} }) {
  const canonicalPropertyId = String(propertyId || '').trim();
  if (!canonicalPropertyId) return null;

  const params = new URLSearchParams({
    property_id: canonicalPropertyId,
    page: String(page),
    page_size: String(pageSize),
  });
  for (const key of ['search', 'status', 'priority', 'date', 'room_name']) {
    const value = String(filters[key] || '').trim();
    if (value && value !== 'all') params.set(key, value);
  }
  return `${MY_JOBS_PATH}?${params.toString()}`;
}

export function isMyJobsAbortError(error) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export function isCurrentMyJobsRequest({
  requestId,
  currentRequestId,
  requestPropertyId,
  currentPropertyId,
}) {
  return (
    requestId === currentRequestId &&
    String(requestPropertyId || '') === String(currentPropertyId || '')
  );
}

export function assertMyJobsPropertyBoundary(jobs, propertyId) {
  const canonicalPropertyId = String(propertyId || '');
  if (!Array.isArray(jobs)) throw new Error('My Jobs response is missing results.');
  if (jobs.some((job) => String(job?.property_id || '') !== canonicalPropertyId)) {
    throw new Error('My Jobs response crossed the active Property boundary.');
  }
  return jobs;
}

export function canMutateMyJob(job, propertyId) {
  return Boolean(
    job?.can_operate === true &&
      propertyId &&
      String(job?.property_id || '') === String(propertyId),
  );
}

export function getMyJobDetailHref(jobId, propertyId) {
  const externalJobId = String(jobId || '').trim();
  const externalPropertyId = String(propertyId || '').trim();
  if (!externalJobId || !externalPropertyId) return null;
  return `/dashboard/jobs/${encodeURIComponent(externalJobId)}?property_id=${encodeURIComponent(externalPropertyId)}`;
}

export async function requestMyJobsPage({
  propertyId,
  page,
  pageSize,
  filters,
  signal,
  fetchImpl = fetch,
}) {
  const url = buildMyJobsUrl({ propertyId, page, pageSize, filters });
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
      throw new Error('My Jobs returned an invalid response.');
    }
  }
  if (!response.ok) {
    const message = data.detail || data.error || `Unable to load My Jobs (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (String(data.property_id || '') !== String(propertyId)) {
    throw new Error('My Jobs response did not match the active Property.');
  }
  assertMyJobsPropertyBoundary(data.results, propertyId);
  return data;
}
