import { NextRequest } from "next/server";
import { proxyDemoRequest } from "@/app/lib/demo-api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  const query = new URLSearchParams();
  for (const key of ["kind", "date", "technician"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  return proxyDemoRequest(request, `/api/v1/demo/email-preview/?${query}`, "GET");
}
