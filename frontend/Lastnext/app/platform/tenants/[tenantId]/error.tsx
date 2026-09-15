"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";

export default function PlatformTenantDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <Card><CardContent className="space-y-4 p-5 sm:p-6"><div><p className="text-sm font-medium text-muted-foreground">Platform operations</p><h1 className="text-xl font-bold">Tenant detail could not load</h1><p className="mt-1 text-sm text-muted-foreground">Retry the request or return to the tenant list. No tenant data has been changed.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" onClick={reset}>Retry</Button><Button asChild variant="outline"><Link href="/platform/tenants">Back to tenants</Link></Button></div></CardContent></Card>;
}
