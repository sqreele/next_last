import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import { getServerSession } from "@/app/lib/session.server";

async function proxyProfile(request: NextRequest, method: "GET" | "PATCH") {
  const session = await getServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json(
      { detail: "Authentication required." },
      { status: 401 },
    );
  }

  const response = await backendFetch(
    `${API_CONFIG.baseUrl}/api/v1/user-profiles/me/`,
    {
      method,
      headers: {
        Authorization: `Bearer ${session.user.accessToken}`,
        "Content-Type": "application/json",
      },
      body:
        method === "PATCH" ? JSON.stringify(await request.json()) : undefined,
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({
    detail: "The profile service returned an invalid response.",
  }));
  return NextResponse.json(payload, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function GET(request: NextRequest) {
  return proxyProfile(request, "GET");
}

export function PATCH(request: NextRequest) {
  return proxyProfile(request, "PATCH");
}
