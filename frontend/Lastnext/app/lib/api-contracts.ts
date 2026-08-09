/** Canonical Django REST Framework page-number pagination response. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Django REST Framework error payload.
 *
 * DRF may return a top-level detail/message, non-field errors, or serializer
 * field errors. Unknown extension fields stay unknown until a consumer narrows
 * them at the API boundary.
 */
export interface ApiErrorDetails {
  detail?: string;
  message?: string;
  non_field_errors?: string[];
  [field: string]: unknown;
}

export interface DRFValidationError {
  [field: string]: string[];
}

export type DRFErrorResponse = ApiErrorDetails;
