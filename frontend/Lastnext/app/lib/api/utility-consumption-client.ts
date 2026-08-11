import {
  isUtilityConsumptionListResponse,
  utilityListQueryString,
  type UtilityConsumptionListItem,
  type UtilityConsumptionListQuery,
} from "./utility-consumption-contracts";

export async function fetchAllUtilityConsumption(
  query: Omit<UtilityConsumptionListQuery, "page" | "page_size">,
  signal?: AbortSignal,
): Promise<UtilityConsumptionListItem[]> {
  const results: UtilityConsumptionListItem[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const queryString = utilityListQueryString({ ...query, page, page_size: 100 });
    const response = await fetch(`/api/utility/consumption?${queryString}`, { signal });
    if (!response.ok) throw new Error("Unable to load utility consumption data.");
    const payload: unknown = await response.json();
    if (!isUtilityConsumptionListResponse(payload)) {
      throw new Error("Invalid utility consumption response contract.");
    }
    results.push(...payload.results);
    totalPages = payload.total_pages;
    page += 1;
  } while (page <= totalPages);

  return results;
}
