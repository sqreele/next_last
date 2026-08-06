import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Property access is assigned by an administrator and cannot be selected during registration.",
      properties: [],
    },
    { status: 403 },
  );
}
