import { redirect } from "next/navigation";
import { requireBillingAccess } from "@/app/lib/billing-access.server";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requireBillingAccess();
  redirect("/dashboard/settings/billing");
}
