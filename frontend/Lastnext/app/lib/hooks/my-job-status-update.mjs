const VALID_JOB_STATUSES = new Set([
  'pending',
  'in_progress',
  'waiting_sparepart',
  'completed',
  'cancelled',
]);

export function buildMyJobStatusUpdateUrl(jobId, propertyId) {
  const normalizedJobId = String(jobId || '').trim();
  const normalizedPropertyId = String(propertyId || '').trim();
  if (!normalizedJobId || !normalizedPropertyId) return null;
  return `/api/v1/jobs/${encodeURIComponent(normalizedJobId)}/update_status/?property_id=${encodeURIComponent(normalizedPropertyId)}`;
}

export async function requestMyJobStatusUpdate({
  jobId,
  propertyId,
  status,
  fetchImpl = fetch,
}) {
  const url = buildMyJobStatusUpdateUrl(jobId, propertyId);
  if (!url) throw new Error('A Job and active Property are required.');
  if (!VALID_JOB_STATUSES.has(status)) throw new Error('Invalid Job status.');

  const response = await fetchImpl(url, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Status update returned an invalid response.');
    }
  }
  if (!response.ok) {
    const message = data.detail || data.error || `Unable to update status (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (
    String(data.job_id || '') !== String(jobId) ||
    String(data.property_id || '') !== String(propertyId) ||
    data.status !== status
  ) {
    throw new Error('Status update response did not match the active Job and Property.');
  }
  return data;
}

export function applyMyJobStatusUpdate(jobs, updatedJob) {
  return jobs.map((job) =>
    String(job.job_id) === String(updatedJob.job_id) ? updatedJob : job,
  );
}
