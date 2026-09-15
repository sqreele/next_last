import { TenantDetailClient } from "@/app/components/platform/TenantDetailClient";
import { PlatformPage } from "@/app/components/platform/PlatformPage";
import { platformGet } from "@/app/lib/platform-dashboard.server";
import { requirePlatformAccess } from "@/app/lib/platform-access.server";
import { getLifecycleDisplay } from "@/app/lib/billing-ui.mjs";

export default async function PlatformTenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requirePlatformAccess("platform.tenants.read");
  const { tenantId } = await params;
  const data = await platformGet(`/api/v1/platform/tenants/${encodeURIComponent(tenantId)}/`);
  const lifecycle = getLifecycleDisplay(data.subscription as Record<string, unknown>, String(data.timezone ?? "UTC"));
  return <PlatformPage title="Tenant detail"><TenantDetailClient data={data} lifecycle={lifecycle} /></PlatformPage>;
}
