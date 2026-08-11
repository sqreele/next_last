import {
  globalSearchQueryString,
  isGlobalSearchResponse,
  type GlobalSearchQuery,
  type GlobalSearchResponse,
} from "./global-search-contracts";

export async function fetchGlobalSearch(
  query: GlobalSearchQuery,
  signal?: AbortSignal,
): Promise<GlobalSearchResponse> {
  const response = await fetch(`/api/search?${globalSearchQueryString(query)}`, { signal });
  if (!response.ok) throw new Error("Unable to load search results.");
  const payload: unknown = await response.json();
  if (!isGlobalSearchResponse(payload)) throw new Error("Invalid global search response contract.");
  return payload;
}
