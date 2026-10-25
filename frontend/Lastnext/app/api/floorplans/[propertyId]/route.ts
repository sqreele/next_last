import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import { getFloorPlanDefinition } from "@/app/lib/floorplans/runtime.mjs";
import { getServerSession } from "@/app/lib/session.server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ propertyId: string }> };

const jsonHeaders = {
  "Cache-Control": "private, no-store",
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: jsonHeaders },
      );
    }

    const { propertyId: rawPropertyId } = await params;
    const propertyId = String(rawPropertyId || "").trim().toUpperCase();
    if (!propertyId || propertyId.length > 50 || !/^[A-Z0-9_-]+$/.test(propertyId)) {
      return NextResponse.json(
        { error: "Invalid property ID" },
        { status: 400, headers: jsonHeaders },
      );
    }

    // Authorize against Django before revealing whether this Property has a
    // prepared floor plan. PropertyViewSet scopes detail access by membership.
    const propertyResponse = await backendFetch(
      `${API_CONFIG.baseUrl}/api/v1/properties/${encodeURIComponent(propertyId)}/`,
      {
        headers: {
          Authorization: `Bearer ${session.user.accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!propertyResponse.ok) {
      const status = propertyResponse.status === 401 || propertyResponse.status === 403
        ? propertyResponse.status
        : propertyResponse.status === 404
          ? 404
          : 502;
      return NextResponse.json(
        { error: status === 502 ? "Unable to verify property access" : "Property unavailable" },
        { status, headers: jsonHeaders },
      );
    }

    const property = await propertyResponse.json() as {
      property_id?: string;
      name?: string;
    };
    if (String(property.property_id || "").toUpperCase() !== propertyId) {
      return NextResponse.json(
        { error: "Property identity mismatch" },
        { status: 502, headers: jsonHeaders },
      );
    }

    const floorPlan = getFloorPlanDefinition(propertyId);
    if (!floorPlan) {
      return NextResponse.json(
        { error: "Floor plan not available for this property" },
        { status: 404, headers: jsonHeaders },
      );
    }

    return NextResponse.json(
      {
        ...floorPlan,
        property: {
          property_id: property.property_id,
          name: property.name || floorPlan.property_name,
        },
      },
      { headers: jsonHeaders },
    );
  } catch (error) {
    console.error("Error loading floor plan", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: jsonHeaders },
    );
  }
}

