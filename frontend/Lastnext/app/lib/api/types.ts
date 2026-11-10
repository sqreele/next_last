/** Shared Django REST Framework list envelope. */
export interface PaginatedResponse<T> {
  results: T[];
  count: number;
  next?: string | null;
  previous?: string | null;
}

export type ListResponse<T> = T[] | PaginatedResponse<T>;
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
