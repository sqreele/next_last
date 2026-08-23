export function buildJobCommentsUrl({ jobId, propertyId, proxy = true }) {
  const normalizedJobId = String(jobId || "").trim();
  const normalizedPropertyId = String(propertyId || "").trim();
  if (!normalizedJobId || !normalizedPropertyId) return null;

  const base = proxy
    ? `/api/jobs/${encodeURIComponent(normalizedJobId)}/comments/`
    : `/api/v1/jobs/${encodeURIComponent(normalizedJobId)}/comments/`;
  return `${base}?property_id=${encodeURIComponent(normalizedPropertyId)}`;
}

export function normalizeJobCommentsResponse(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
}

export function getCommentsViewState({
  loading,
  error,
  comments,
  pendingCount = 0,
}) {
  if (loading) return "loading";
  if (error) return "error";
  return comments.length + pendingCount === 0 ? "empty" : "ready";
}

export function canSubmitJobComment({ text, submitting, canComment }) {
  return (
    canComment === true &&
    submitting !== true &&
    String(text || "").trim().length > 0
  );
}

export function appendAuthoritativeComment(comments, createdComment) {
  if (!createdComment?.id) return comments;
  if (
    comments.some((comment) => String(comment.id) === String(createdComment.id))
  ) {
    return comments;
  }
  return [...comments, createdComment];
}
