import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/app/lib/session.server";
import { API_CONFIG } from "@/app/lib/config";
import {
  toJobSearchResult,
  toPropertySearchResult,
  toRoomSearchResult,
  type GlobalSearchResult,
  type SearchPropertyRef,
} from "@/app/lib/api/global-search-contracts";

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Search source failed with HTTP ${response.status}`);
  return response.json();
}

function requireArrayPayload(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid search source array contract");
  return value;
}

function requirePaginatedResults(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null || !("results" in value) || !Array.isArray(value.results)) {
    throw new Error("Invalid search source pagination contract");
  }
  return value.results;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const propertyId = searchParams.get("property_id")?.trim() ?? "";
    if (!query) return NextResponse.json({ results: [], total: 0 });
    if (!propertyId) return NextResponse.json({ error: "property_id is required" }, { status: 400 });

    const headers = { Authorization: `Bearer ${session.user.accessToken}`, "Content-Type": "application/json" };
    const encodedQuery = encodeURIComponent(query);
    const encodedProperty = encodeURIComponent(propertyId);
    const [jobsPayload, propertiesPayload, roomsPayload] = await Promise.all([
      fetch(`${API_CONFIG.baseUrl}/api/v1/jobs/?search=${encodedQuery}&property_id=${encodedProperty}&page_size=100`, { headers }).then(readJson),
      fetch(`${API_CONFIG.baseUrl}/api/v1/properties/`, { headers }).then(readJson),
      fetch(`${API_CONFIG.baseUrl}/api/v1/rooms/?property=${encodedProperty}`, { headers }).then(readJson),
    ]);

    const normalizedQuery = query.toLocaleLowerCase();
    const propertyValues = requireArrayPayload(propertiesPayload);
    const propertyRefs: SearchPropertyRef[] = propertyValues.flatMap((value) => {
      if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "number" ||
        !("property_id" in value) || typeof value.property_id !== "string" || !("name" in value) || typeof value.name !== "string") return [];
      return [{ id: value.id, property_id: value.property_id, name: value.name }];
    });

    const jobs = requirePaginatedResults(jobsPayload).flatMap((value) => {
      const result = toJobSearchResult(value);
      return result ? [result] : [];
    });
    const properties = propertyValues.flatMap((value) => {
      const result = toPropertySearchResult(value);
      if (!result) return [];
      return [result.name, result.description, result.id].some((field) => field?.toLocaleLowerCase().includes(normalizedQuery)) ? [result] : [];
    });
    const rooms = requireArrayPayload(roomsPayload).flatMap((value) => {
      const result = toRoomSearchResult(value, propertyRefs);
      if (!result) return [];
      return [result.name, result.room_type, String(result.id)].some((field) => field.toLocaleLowerCase().includes(normalizedQuery)) ? [result] : [];
    });
    const results: GlobalSearchResult[] = [...jobs, ...properties, ...rooms];
    return NextResponse.json({ results, total: results.length });
  } catch (error) {
    console.error("Error fetching search results:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
