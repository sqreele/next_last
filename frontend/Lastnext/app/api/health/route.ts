import { NextResponse } from 'next/server'

const healthResponse = () =>
  NextResponse.json(
    { status: 'ok' },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )

export const dynamic = 'force-dynamic'

export function GET() {
  return healthResponse()
}

export function HEAD() {
  return healthResponse()
}
