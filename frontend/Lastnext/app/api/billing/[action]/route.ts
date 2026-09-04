import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import { getCompatServerSession } from "@/app/lib/auth0/server-session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ action: string }>;
};

const GET_ACTIONS: Record<string, string> = {
  tenants: "/api/v1/tenants/",
  plans: "/api/v1/subscription-plans/",
  status: "/api/v1/tenant-subscriptions/entitlement/",
};

const POST_ACTIONS: Record<string, string> = {
  checkout: "/api/v1/billing/checkout/",
  portal: "/api/v1/billing/portal/",
};

async function proxyBillingRequest(
  request: NextRequest,
  context: RouteContext,
  actions: Record<string, string>,
) {
  const session = await getCompatServerSession();
  const accessToken = session?.user?.accessToken;
  if (!accessToken) {
    return NextResponse.json(
      { code: "authentication_required", detail: "Authentication required." },
      { status: 401 },
    );
  }

  const { action } = await context.params;
  const backendPath = actions[action];
  if (!backendPath) {
    return NextResponse.json(
      { code: "billing_route_not_found", detail: "Billing route not found." },
      { status: 404 },
    );
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };
  if (request.method === "POST") {
    init.body = await request.arrayBuffer();
  }

  const response = await backendFetch(
    `${API_CONFIG.baseUrl}${backendPath}${request.nextUrl.search}`,
    init,
  );
  const responseContentType = response.headers.get("content-type");
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: responseContentType ? { "content-type": responseContentType } : undefined,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyBillingRequest(request, context, GET_ACTIONS);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyBillingRequest(request, context, POST_ACTIONS);
}
