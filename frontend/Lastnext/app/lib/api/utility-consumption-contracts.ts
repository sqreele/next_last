export const UTILITY_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type UtilityMonthName = (typeof UTILITY_MONTH_NAMES)[number];
export type UtilityDecimal = number | null;

export interface UtilityConsumptionListItem {
  id: number;
  property_id: string;
  property_name: string;
  month: number;
  month_display: UtilityMonthName;
  year: number;
  totalkwh: UtilityDecimal;
  onpeakkwh: UtilityDecimal;
  offpeakkwh: UtilityDecimal;
  totalelectricity: UtilityDecimal;
  electricity_cost_budget: UtilityDecimal;
  water: UtilityDecimal;
  nightsale: UtilityDecimal;
  created_at: string;
  updated_at: string;
}

export interface UtilityConsumptionListResponse {
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
  results: UtilityConsumptionListItem[];
}

export interface UtilityConsumptionDetail extends UtilityConsumptionListItem {
  property: number;
  created_by: number | null;
  created_by_username: string;
  created_by_name: string;
}

export interface UtilityConsumptionCreatePayload {
  property: number;
  month: number;
  year: number;
  totalkwh?: UtilityDecimal;
  onpeakkwh?: UtilityDecimal;
  offpeakkwh?: UtilityDecimal;
  totalelectricity?: UtilityDecimal;
  electricity_cost_budget?: UtilityDecimal;
  water?: UtilityDecimal;
  nightsale?: UtilityDecimal;
}

export type UtilityConsumptionUpdatePayload = UtilityConsumptionCreatePayload;
export type UtilityConsumptionPatchPayload = Partial<UtilityConsumptionCreatePayload>;

export interface UtilityConsumptionListQuery {
  property_id?: string;
  property?: number;
  month?: number;
  year?: number;
  search?: string;
  ordering?: "year" | "-year" | "month" | "-month" | "created_at" | "-created_at" | "updated_at" | "-updated_at";
  page?: number;
  page_size?: number;
}

function isNullableNumber(value: unknown): value is UtilityDecimal {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function isUtilityMonthName(value: unknown): value is UtilityMonthName {
  return typeof value === "string" && (UTILITY_MONTH_NAMES as readonly string[]).includes(value);
}

export function isUtilityConsumptionListItem(value: unknown): value is UtilityConsumptionListItem {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value && typeof value.id === "number" &&
    "property_id" in value && typeof value.property_id === "string" &&
    "property_name" in value && typeof value.property_name === "string" &&
    "month" in value && typeof value.month === "number" && Number.isInteger(value.month) && value.month >= 1 && value.month <= 12 &&
    "month_display" in value && isUtilityMonthName(value.month_display) &&
    "year" in value && Number.isInteger(value.year) &&
    "totalkwh" in value && isNullableNumber(value.totalkwh) &&
    "onpeakkwh" in value && isNullableNumber(value.onpeakkwh) &&
    "offpeakkwh" in value && isNullableNumber(value.offpeakkwh) &&
    "totalelectricity" in value && isNullableNumber(value.totalelectricity) &&
    "electricity_cost_budget" in value && isNullableNumber(value.electricity_cost_budget) &&
    "water" in value && isNullableNumber(value.water) &&
    "nightsale" in value && isNullableNumber(value.nightsale) &&
    "created_at" in value && typeof value.created_at === "string" &&
    "updated_at" in value && typeof value.updated_at === "string"
  );
}

export function isUtilityConsumptionListResponse(value: unknown): value is UtilityConsumptionListResponse {
  if (typeof value !== "object" || value === null) return false;
  return (
    "count" in value && typeof value.count === "number" && Number.isInteger(value.count) && value.count >= 0 &&
    "total_pages" in value && typeof value.total_pages === "number" && Number.isInteger(value.total_pages) && value.total_pages >= 0 &&
    "current_page" in value && typeof value.current_page === "number" && Number.isInteger(value.current_page) && value.current_page >= 1 &&
    "page_size" in value && typeof value.page_size === "number" && Number.isInteger(value.page_size) && value.page_size >= 1 &&
    "next" in value && (value.next === null || typeof value.next === "string") &&
    "previous" in value && (value.previous === null || typeof value.previous === "string") &&
    "results" in value && Array.isArray(value.results) &&
    value.results.every(isUtilityConsumptionListItem)
  );
}

export function utilityListQueryString(query: UtilityConsumptionListQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}
