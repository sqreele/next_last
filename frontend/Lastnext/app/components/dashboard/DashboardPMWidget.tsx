"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { createPreventiveMaintenanceService } from "@/app/lib/PreventiveMaintenanceService";
import type { PreventiveMaintenance } from "@/app/lib/preventiveMaintenanceModels";

export default function DashboardPMWidget({ propertyId, refreshKey }: { propertyId: string; refreshKey: number }) {
  const [items, setItems] = useState<PreventiveMaintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    let active = true;
    setLoading(true);
    setFailed(false);
    try {
      const service = createPreventiveMaintenanceService();
      const response = await service.getAllPreventiveMaintenance({ property_id: propertyId, page: 1, page_size: 5, ordering: "scheduled_date" });
      if (!active) return;
      const payload = response.data as any;
      const rows = Array.isArray(payload) ? payload : payload?.results ?? payload?.items ?? payload?.data ?? [];
      setItems(Array.isArray(rows) ? rows.slice(0, 5) : []);
    } catch {
      if (active) setFailed(true);
    } finally {
      if (active) setLoading(false);
    }
    return () => { active = false; };
  }, [propertyId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return <section className="rounded-xl border border-border bg-card p-5 shadow-soft" aria-labelledby="dashboard-pm-heading">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><h2 id="dashboard-pm-heading" className="font-semibold">Preventive maintenance</h2><p className="text-sm text-muted-foreground">Upcoming and recent PM for this property</p></div>
      <Button asChild variant="outline" size="sm"><Link href="/dashboard/preventive-maintenance">View all</Link></Button>
    </div>
    {loading ? <p className="text-sm text-muted-foreground" role="status">Loading PM…</p> : failed ? <p className="text-sm text-destructive">Unable to load preventive maintenance.</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">No preventive maintenance records yet.</p> : <ul className="divide-y divide-border">{items.map((item) => <li key={item.pm_id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <Link className="min-w-0 flex-1 hover:underline" href={`/dashboard/preventive-maintenance/${encodeURIComponent(item.pm_id)}`}><span className="block truncate font-medium">{item.pmtitle || item.procedure_template_name || item.pm_id}</span><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString() : "—"} · {item.status || "pending"}</span></Link>
      {(item.machines || []).length > 0 && <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:block">{item.machines?.map((machine) => machine.name || machine.machine_id).join(", ")}</span>}
    </li>)}</ul>}
  </section>;
}
