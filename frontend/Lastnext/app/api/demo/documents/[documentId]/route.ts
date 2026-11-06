import { NextRequest, NextResponse } from "next/server";
import { proxyDemoRequest } from "@/app/lib/demo-api-proxy";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!/^\d+$/.test(documentId)) return NextResponse.json({ detail: "Invalid document ID." }, { status: 400 });
  return proxyDemoRequest(request, `/api/v1/demo/documents/${documentId}/`, "GET");
}
