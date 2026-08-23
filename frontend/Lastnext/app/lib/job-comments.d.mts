import type { JobComment } from "@/app/lib/types";

export type CommentsViewState = "loading" | "error" | "empty" | "ready";

export function buildJobCommentsUrl(options: {
  jobId?: string | number | null;
  propertyId?: string | number | null;
  proxy?: boolean;
}): string | null;

export function normalizeJobCommentsResponse(data: unknown): JobComment[];

export function getCommentsViewState(options: {
  loading: boolean;
  error: string | null;
  comments: JobComment[];
  pendingCount?: number;
}): CommentsViewState;

export function canSubmitJobComment(options: {
  text: string;
  submitting: boolean;
  canComment: boolean;
}): boolean;

export function appendAuthoritativeComment(
  comments: JobComment[],
  createdComment: JobComment,
): JobComment[];
