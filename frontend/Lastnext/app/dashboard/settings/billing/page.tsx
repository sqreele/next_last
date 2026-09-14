import { requireBillingAccess } from "@/app/lib/billing-access.server";
import BillingSettingsClient from "./BillingSettingsClient";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  await requireBillingAccess();
  return <BillingSettingsClient />;
}
