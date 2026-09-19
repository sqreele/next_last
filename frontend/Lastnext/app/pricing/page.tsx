import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/app/components/branding/Logo";
import { Button } from "@/app/components/ui/button";
import { getCommercialPlans } from "@/app/lib/commercial-plans.server";
import { PLATFORM_FEATURES, featureStatus, formatStorage, type PlatformPlan } from "@/app/lib/platform-plans.mjs";
import { seoConfig } from "@/app/lib/seo-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "StayMaint Pricing | Hotel Maintenance Plans",
  description: "Choose the StayMaint plan that fits your hotel maintenance operation, from daily work tracking to multi-property management.",
  alternates: { canonical: "/pricing/" },
  openGraph: { title: "StayMaint Pricing | Hotel Maintenance Plans", description: "Straightforward monthly plans for hotel maintenance teams.", url: `${seoConfig.siteUrl}/pricing/`, siteName: seoConfig.siteName, type: "website", locale: "en_US", images: seoConfig.openGraph.images },
};

const descriptions: Record<string, string> = {
  starter: "For small hotel teams that need a simple and reliable way to manage daily maintenance work.",
  pro: "For active hotel engineering teams that need preventive maintenance, reporting, and better operational visibility.",
  enterprise: "For hotel groups and multi-property engineering operations that need centralized maintenance management.",
};

const quotaRows: Array<[string, keyof PlatformPlan, boolean?]> = [
  ["Users", "max_users"], ["Properties", "max_properties"], ["Jobs / month", "max_monthly_work_orders"],
  ["PM schedules", "max_pm_schedules"], ["Assets", "max_assets"], ["Storage", "max_storage_mb", true],
];

export default async function PricingPage() {
  const plans = await getCommercialPlans();
  return <div className="min-h-screen bg-[var(--pcms-app-bg)] text-foreground">
    <header className="border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"><Link href="/" aria-label="StayMaint home"><Logo variant="horizontal" markClassName="size-9" /></Link><div className="flex items-center gap-2"><Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex"><Link href="/auth/login/">Sign in</Link></Button><Button size="sm" asChild><Link href="/auth/register/?plan=pro">Get started</Link></Button></div></div></header>
    <main><section className="px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-20 lg:px-8"><p className="text-sm font-semibold text-primary">Simple monthly pricing</p><h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Plans that grow with your hotel operation</h1><p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-muted-foreground">Choose the maintenance tools and operational visibility your team needs today.</p>
      <div className="mx-auto mt-12 grid max-w-7xl gap-6 text-left lg:grid-cols-3 lg:items-stretch">{plans.map((plan) => <article key={plan.code} className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft sm:p-8 ${plan.code === "pro" ? "border-primary ring-2 ring-primary/20 lg:-my-3 lg:py-11" : "border-border"}`}>{plan.code === "pro" && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-primary-foreground">MOST POPULAR</span>}<h2 className="text-2xl font-semibold">{plan.name}</h2><p className="mt-4 min-h-20 text-sm leading-6 text-muted-foreground">{descriptions[plan.code]}</p><div className="mt-6 flex items-end gap-2"><span className="text-5xl font-semibold tracking-tight">${Number(plan.monthly_price).toFixed(0)}</span><span className="pb-1 text-sm text-muted-foreground">/month</span></div><Button size="lg" asChild className={`mt-7 w-full ${plan.code === "pro" ? "shadow-lg shadow-primary/20" : ""}`}><Link href={`/auth/register/?plan=${plan.code}`}>Get {plan.name}</Link></Button><dl className="mt-8 space-y-2 border-t border-border pt-6 text-sm">{quotaRows.map(([label, key, storage]) => <div className="flex justify-between gap-3" key={key}><dt>{label}</dt><dd className="font-medium">{storage ? formatStorage(plan[key]) : String(plan[key] ?? "—")}</dd></div>)}</dl></article>)}</div>
    </section><section className="border-y border-border bg-card px-4 py-16 sm:px-6 sm:py-20 lg:px-8"><div className="mx-auto max-w-5xl"><div className="text-center"><h2 className="text-3xl font-semibold tracking-tight">Compare plans</h2><p className="mt-3 text-muted-foreground">See what is included at each level.</p></div><div className="mt-10 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50 text-left"><tr><th scope="col" className="p-4 font-semibold">Feature</th>{plans.map((plan) => <th className="p-4 text-center font-semibold" key={plan.code} scope="col">{plan.name}</th>)}</tr></thead><tbody className="divide-y divide-border">{PLATFORM_FEATURES.map((feature) => <tr key={feature.key}><th scope="row" className="p-4 text-left font-medium">{feature.label}</th>{plans.map((plan) => <td className="p-4 text-center" key={plan.code}>{featureStatus(plan, feature)}</td>)}</tr>)}</tbody></table></div></div></section></main>
  </div>;
}
