import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import { getCompatServerSession } from "@/app/lib/auth0/server-session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ action: string }>;
};

const GET_ACTIONS: Record<string, string> = {
  company: "/api/v1/billing/company/",
  operation: "/api/v1/billing/operation/",
  tenants: "/api/v1/tenants/billing/",
  plans: "/api/v1/subscription-plans/",
  status: "/api/v1/tenant-subscriptions/entitlement/",
  profile: "/api/v1/billing/profile/",
  promptpay: "/api/v1/billing/promptpay/",
  invoices: "/api/v1/billing/invoices/",
  document: "/api/v1/billing/document/",
};

const POST_ACTIONS: Record<string, string> = {
  preview: "/api/v1/billing/preview/",
  confirm: "/api/v1/billing/confirm/",
  checkout: "/api/v1/billing/checkout/",
  portal: "/api/v1/billing/portal/",
  profile: "/api/v1/billing/profile/",
  promptpay: "/api/v1/billing/promptpay/",
  "invoice-refresh": "/api/v1/billing/invoices/",
  "invoice-pay": "/api/v1/billing/invoice-pay/",
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
  const responseHeaders = new Headers({ "Cache-Control": "private, no-store" });
  if (responseContentType) responseHeaders.set("Content-Type", responseContentType);
  const disposition = response.headers.get("content-disposition");
  if (disposition) responseHeaders.set("Content-Disposition", disposition);
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyBillingRequest(request, context, GET_ACTIONS);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyBillingRequest(request, context, POST_ACTIONS);
}
