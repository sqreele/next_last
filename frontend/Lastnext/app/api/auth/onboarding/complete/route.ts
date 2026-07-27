import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Self-service property assignment is disabled. Contact an administrator.",
    },
    { status: 403 },
  );
}
