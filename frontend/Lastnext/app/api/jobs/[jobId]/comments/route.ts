// app/api/jobs/[jobId]/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/app/lib/session.server";
import { API_CONFIG } from "@/app/lib/config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { jobId } = await params;
    const propertyId = request.nextUrl.searchParams.get("property_id");
    if (!propertyId) {
      return NextResponse.json(
        { detail: "A property_id is required." },
        { status: 400 },
      );
    }
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/comments/?property_id=${encodeURIComponent(propertyId)}`,
      {
        headers: {
          Authorization: `Bearer ${session.user.accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error fetching job comments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { jobId } = await params;
    const propertyId = request.nextUrl.searchParams.get("property_id");
    if (!propertyId) {
      return NextResponse.json(
        { detail: "A property_id is required." },
        { status: 400 },
      );
    }
    const body = await request.json();
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/comments/?property_id=${encodeURIComponent(propertyId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.user.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error creating job comment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
