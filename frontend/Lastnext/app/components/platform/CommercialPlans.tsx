import {
  PLATFORM_FEATURES,
  featureStatus,
  formatStorage,
  type PlatformPlan,
} from "@/app/lib/platform-plans.mjs";

const quotaRows = [
  ["Jobs / month", "max_monthly_work_orders"],
  ["PM schedules", "max_pm_schedules"],
  ["Assets", "max_assets"],
] as const;

export function CommercialPlans({ plans }: { plans: PlatformPlan[] }) {
  if (!plans.length) {
    return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Commercial plan data is unavailable.</p>;
  }

  return <div className="space-y-6">
    <section aria-labelledby="commercial-plans-heading" className="space-y-3">
      <div>
        <h2 id="commercial-plans-heading" className="text-xl font-semibold">Commercial Plans</h2>
        <p className="text-sm text-muted-foreground">Current pricing, capacity, and usage limits from the subscription plan catalog.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => <article key={plan.code} className="rounded-xl border bg-card p-5 shadow-soft">
          <p className="text-sm font-medium text-muted-foreground">{plan.code}</p>
          <h3 className="mt-1 text-xl font-bold">{plan.name}</h3>
          <p className="mt-2 text-2xl font-bold">${Number(plan.monthly_price).toFixed(0)} <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt>Users</dt><dd className="font-medium">{plan.max_users}</dd></div>
            <div className="flex justify-between gap-3"><dt>Properties</dt><dd className="font-medium">{plan.max_properties}</dd></div>
            {quotaRows.map(([label, key]) => <div className="flex justify-between gap-3" key={key}><dt>{label}</dt><dd className="font-medium">{plan[key]}</dd></div>)}
            <div className="flex justify-between gap-3"><dt>Storage</dt><dd className="font-medium">{formatStorage(plan.max_storage_mb)}</dd></div>
          </dl>
        </article>)}
      </div>
    </section>

    <section aria-labelledby="feature-comparison-heading" className="space-y-3">
      <h2 id="feature-comparison-heading" className="text-xl font-semibold">Feature Comparison</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">Feature</th>{plans.map((plan) => <th className="p-3 text-left" key={plan.code}>{plan.name}</th>)}</tr></thead>
          <tbody>{PLATFORM_FEATURES.map((feature) => <tr className="border-b last:border-0" key={feature.key}><th className="p-3 text-left font-medium">{feature.label}</th>{plans.map((plan) => <td className="p-3" key={`${plan.code}-${feature.key}`}>{featureStatus(plan, feature)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
