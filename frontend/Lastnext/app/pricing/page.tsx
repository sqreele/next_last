import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Logo } from "@/app/components/branding/Logo";
import { Button } from "@/app/components/ui/button";
import { seoConfig } from "@/app/lib/seo-config";

export const metadata: Metadata = {
  title: "StayMaint Pricing | Hotel Maintenance Plans",
  description: "Choose the StayMaint plan that fits your hotel maintenance operation, from daily work tracking to multi-property management.",
  alternates: { canonical: "/pricing/" },
  openGraph: { title: "StayMaint Pricing | Hotel Maintenance Plans", description: "Straightforward monthly plans for hotel maintenance teams.", url: `${seoConfig.siteUrl}/pricing/`, siteName: seoConfig.siteName, type: "website", locale: "en_US", images: seoConfig.openGraph.images },
};

const plans = [
  { code: "starter", name: "Basic", price: 15, popular: false, description: "For small hotel teams that need a simple and reliable way to manage daily maintenance work.", features: ["Maintenance job tracking", "Before / after photo updates", "Job status workflow", "Basic dashboard", "Room maintenance history", "Equipment / machine history", "Property-based access", "User and technician management"] },
  { code: "pro", name: "Pro", price: 30, popular: true, description: "For active hotel engineering teams that need preventive maintenance, reporting, and better operational visibility.", features: ["Everything in Basic", "Preventive maintenance", "PM schedules", "Technician KPI dashboard", "Advanced maintenance reports", "CSV export", "LINE / notification integration where supported", "Maintenance performance analytics", "Priority support"] },
  { code: "enterprise", name: "Enterprise", price: 60, popular: false, description: "For hotel groups and multi-property engineering operations that need centralized maintenance management.", features: ["Everything in Pro", "Multi-property management", "Portfolio dashboard (Coming soon)", "Cross-property maintenance visibility", "Advanced user permissions", "Property-specific access controls", "Centralized KPI monitoring", "Assisted onboarding", "Priority support"] },
] as const;

const comparisonRows = [
  ["Maintenance jobs", true, true, true], ["Photo attachments", true, true, true], ["Room history", true, true, true], ["Equipment history", true, true, true], ["Preventive maintenance", false, true, true], ["PM schedules", false, true, true], ["Technician KPI", false, true, true], ["Advanced reports", false, true, true], ["CSV export", false, true, true], ["Multi-property", false, false, true], ["Portfolio dashboard", false, false, true], ["Advanced property permissions", false, false, true],
] as const;

function Included({ value }: { value: boolean }) {
  return value ? <Check className="mx-auto h-5 w-5 text-primary" aria-label="Included" /> : <span className="text-muted-foreground" aria-label="Not included">—</span>;
}

export default function PricingPage() {
  return <div className="min-h-screen bg-[var(--pcms-app-bg)] text-foreground">
    <header className="border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"><Link href="/" aria-label="StayMaint home"><Logo variant="horizontal" markClassName="size-9" /></Link><div className="flex items-center gap-2"><Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex"><Link href="/auth/login/">Sign in</Link></Button><Button size="sm" asChild><Link href="/auth/register/?plan=pro">Get started</Link></Button></div></div></header>
    <main><section className="px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-20 lg:px-8"><p className="text-sm font-semibold text-primary">Simple monthly pricing</p><h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Plans that grow with your hotel operation</h1><p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-muted-foreground">Choose the maintenance tools and operational visibility your team needs today.</p>
      <div className="mx-auto mt-12 grid max-w-7xl gap-6 text-left lg:grid-cols-3 lg:items-stretch">{plans.map((plan) => <article key={plan.code} className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft sm:p-8 ${plan.popular ? "border-primary ring-2 ring-primary/20 lg:-my-3 lg:py-11" : "border-border"}`}>{plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-primary-foreground">MOST POPULAR</span>}<h2 className="text-2xl font-semibold">{plan.name}</h2><p className="mt-4 min-h-20 text-sm leading-6 text-muted-foreground">{plan.description}</p><div className="mt-6 flex items-end gap-2"><span className="text-5xl font-semibold tracking-tight">${plan.price}</span><span className="pb-1 text-sm text-muted-foreground">/month</span></div><Button size="lg" asChild className={`mt-7 w-full ${plan.popular ? "shadow-lg shadow-primary/20" : ""}`}><Link href={`/auth/register/?plan=${plan.code}`}>Get {plan.name}</Link></Button><ul className="mt-8 space-y-3 border-t border-border pt-6 text-sm">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span>{feature}</span></li>)}</ul></article>)}</div>
    </section><section className="border-y border-border bg-card px-4 py-16 sm:px-6 sm:py-20 lg:px-8"><div className="mx-auto max-w-5xl"><div className="text-center"><h2 className="text-3xl font-semibold tracking-tight">Compare plans</h2><p className="mt-3 text-muted-foreground">See what is included at each level.</p></div><div className="mt-10 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50 text-left"><tr><th scope="col" className="p-4 font-semibold">Feature</th><th scope="col" className="p-4 text-center font-semibold">Basic</th><th scope="col" className="bg-primary/5 p-4 text-center font-semibold text-primary">Pro</th><th scope="col" className="p-4 text-center font-semibold">Enterprise</th></tr></thead><tbody className="divide-y divide-border">{comparisonRows.map(([feature, basic, pro, enterprise]) => <tr key={feature}><th scope="row" className="p-4 text-left font-medium">{feature}</th><td className="p-4 text-center"><Included value={basic} /></td><td className="bg-primary/[0.03] p-4 text-center"><Included value={pro} /></td><td className="p-4 text-center"><Included value={enterprise} /></td></tr>)}</tbody></table></div></div></section></main>
  </div>;
}
