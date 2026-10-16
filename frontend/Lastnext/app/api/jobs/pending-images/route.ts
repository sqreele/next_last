import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/app/lib/session.server";
import { API_CONFIG } from "@/app/lib/config";
import { backendFetch } from "@/app/lib/backend-fetch";

async function proxy(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = new URL(`${API_CONFIG.baseUrl}/api/v1/jobs/pending-images/`);
  const token = request.nextUrl.searchParams.get("token");
  if (token) target.searchParams.set("token", token);

  const options: RequestInit = {
    method: request.method,
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
  };
  if (request.method !== "DELETE" || request.headers.get("content-length") !== "0") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      options.body = (await request.formData()) as FormData;
    } else if (request.method !== "DELETE") {
      options.headers = { ...options.headers, "Content-Type": "application/json" };
      options.body = JSON.stringify(await request.json());
    }
  }

  const response = await backendFetch(target.toString(), options);
  if (response.status === 204) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = { detail: response.statusText };
  }
  return NextResponse.json(body, { status: response.status });
}

export const POST = proxy;
export const DELETE = proxy;
