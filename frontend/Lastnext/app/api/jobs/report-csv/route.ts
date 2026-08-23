import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/app/lib/config";
import { backendFetch } from "@/app/lib/backend-fetch";
import { getServerSession } from "@/app/lib/session.server";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const params = new URLSearchParams(request.nextUrl.searchParams);
  if (!params.get("property_id")) {
    return NextResponse.json(
      { detail: "Select a property to export this report." },
      { status: 400 },
    );
  }

  try {
    const response = await backendFetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/report-csv/?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${session.user.accessToken}`,
          Accept: "text/csv",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { detail: detail || "Unable to export CSV." },
        { status: response.status },
      );
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "text/csv; charset=utf-8",
        "Content-Disposition":
          response.headers.get("content-disposition") ||
          'attachment; filename="jobs-report.csv"',
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to export CSV." },
      { status: 500 },
    );
  }
}
