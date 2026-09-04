"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MachineService, { type Machine } from "@/app/lib/MachineService";
import TopicService, { type Topic } from "@/app/lib/TopicService";
import {
  createPreventiveMaintenanceService,
  type CreatePMMasterPlanData,
  type PMMasterPlan,
} from "@/app/lib/PreventiveMaintenanceService";
import {
  fetchAllMaintenanceProcedures,
  type MaintenanceProcedureTemplate,
} from "@/app/lib/maintenanceProcedures";
import { useSession } from "@/app/lib/session.client";
import { useMainStore } from "@/app/lib/stores/mainStore";

const FREQUENCIES = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["semi_annual", "Semi-annual"],
  ["annual", "Annual"],
  ["custom", "Custom interval"],
] as const;

type FormState = {
  title: string;
  machineIds: string[];
  topicIds: number[];
  startDate: string;
  frequency: string;
  customDays: string;
  leadTimeDays: string;
  procedureTemplate: string;
  active: boolean;
  notes: string;
  procedure: string;
  remarks: string;
};

const emptyForm = (): FormState => ({
  title: "",
  machineIds: [],
  topicIds: [],
  startDate: "",
  frequency: "monthly",
  customDays: "",
  leadTimeDays: "7",
  procedureTemplate: "",
  active: true,
  notes: "",
  procedure: "",
  remarks: "",
});

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const messageFromError = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function PMMasterPlanForm({ planId }: { planId?: string }) {
  const router = useRouter();
  const { status } = useSession();
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const properties = useMainStore((state) => state.properties);
  const activePropertyName = properties.find(
    (property) => property.property_id === selectedPropertyId,
  )?.name;
  const requestRef = useRef(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [procedures, setProcedures] = useState<MaintenanceProcedureTemplate[]>([]);
  const [canOperate, setCanOperate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const requestId = ++requestRef.current;
    setForm(emptyForm());
    setMachines([]);
    setTopics([]);
    setProcedures([]);
    setError(null);
    setCanOperate(false);

    if (status !== "authenticated" || !selectedPropertyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const service = createPreventiveMaintenanceService();
    const machineService = new MachineService();
    const topicService = new TopicService();

    Promise.all([
      machineService.getMachines(selectedPropertyId),
      topicService.getTopics(selectedPropertyId),
      fetchAllMaintenanceProcedures({ pageSize: 100 }),
      service.getMaintenanceStatistics({ property_id: selectedPropertyId }),
      planId ? service.getPMMasterPlan(planId, selectedPropertyId) : Promise.resolve(null),
    ])
      .then(([machineResponse, topicResponse, procedureResponse, statsResponse, planResponse]) => {
        if (requestId !== requestRef.current) return;
        setMachines(machineResponse.success && Array.isArray(machineResponse.data) ? machineResponse.data : []);
        setTopics(topicResponse.success && Array.isArray(topicResponse.data) ? topicResponse.data : []);
        setProcedures(Array.isArray(procedureResponse) ? procedureResponse : []);
        setCanOperate(statsResponse.data?.can_operate === true);

        const plan = planResponse?.data as PMMasterPlan | undefined;
        if (plan) {
          setForm({
            title: plan.title,
            machineIds: plan.machines?.map((machine) => machine.machine_id) || [],
            topicIds: plan.topics?.map((topic) => topic.id) || [],
            startDate: toDateTimeLocal(plan.start_date),
            frequency: plan.frequency,
            customDays: plan.custom_days == null ? "" : String(plan.custom_days),
            leadTimeDays: String(plan.lead_time_days),
            procedureTemplate: plan.procedure_template == null ? "" : String(plan.procedure_template),
            active: plan.active,
            notes: plan.notes || "",
            procedure: plan.procedure || "",
            remarks: plan.remarks || "",
          });
        }
      })
      .catch((requestError: unknown) => {
        if (requestId === requestRef.current) {
          setError(messageFromError(requestError, "Unable to load the PM master plan form."));
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });

    return () => {
      requestRef.current += 1;
    };
  }, [planId, selectedPropertyId, status]);

  const selectedMachineNames = useMemo(
    () => machines.filter((machine) => form.machineIds.includes(machine.machine_id)),
    [form.machineIds, machines],
  );

  const toggleMachine = (machineId: string) => {
    setForm((current) => ({
      ...current,
      machineIds: current.machineIds.includes(machineId)
        ? current.machineIds.filter((id) => id !== machineId)
        : [...current.machineIds, machineId],
    }));
  };

  const toggleTopic = (topicId: number) => {
    setForm((current) => ({
      ...current,
      topicIds: current.topicIds.includes(topicId)
        ? current.topicIds.filter((id) => id !== topicId)
        : [...current.topicIds, topicId],
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = "Plan name is required.";
    if (!form.startDate) nextErrors.startDate = "Start date and time are required.";
    if (form.machineIds.length === 0) nextErrors.machineIds = "Select at least one machine.";
    if (form.frequency === "custom" && Number(form.customDays) < 1) {
      nextErrors.customDays = "Custom interval must be at least one day.";
    }
    if (Number(form.leadTimeDays) < 0) nextErrors.leadTimeDays = "Lead time cannot be negative.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !selectedPropertyId) return;
    const submitPropertyId = selectedPropertyId;

    const payload: CreatePMMasterPlanData = {
      title: form.title.trim(),
      machine_ids: form.machineIds,
      topic_ids: form.topicIds,
      start_date: new Date(form.startDate).toISOString(),
      frequency: form.frequency,
      custom_days: form.frequency === "custom" ? Number(form.customDays) : undefined,
      lead_time_days: Number(form.leadTimeDays),
      procedure_template: form.procedureTemplate ? Number(form.procedureTemplate) : undefined,
      active: form.active,
      notes: form.notes,
      procedure: form.procedure,
      remarks: form.remarks,
    };

    setSubmitting(true);
    setError(null);
    try {
      const service = createPreventiveMaintenanceService();
      const response = planId
        ? await service.updatePMMasterPlan(planId, payload, submitPropertyId)
        : await service.createPMMasterPlan(payload, submitPropertyId);
      if (useMainStore.getState().selectedPropertyId !== submitPropertyId) return;
      if (!response.success || !response.data) throw new Error(response.message || "Unable to save plan.");
      router.push(`/dashboard/preventive-maintenance/${response.data.plan_id}`);
      router.refresh();
    } catch (requestError: unknown) {
      if (useMainStore.getState().selectedPropertyId !== submitPropertyId) return;
      setError(messageFromError(requestError, "Unable to save the PM master plan."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedPropertyId) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-bold">Select a property</h1>
        <p className="mt-2 text-muted-foreground">Select a property to manage PM master plans.</p>
      </div>
    );
  }

  if (loading || status === "loading") {
    return <div className="rounded-xl border border-border bg-card p-8 text-center" role="status">Loading PM master plan…</div>;
  }

  if (!canOperate) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950" role="alert">
        Your role can view PM master plans but cannot create or edit them.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-6">
      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Active property: <strong>{activePropertyName || selectedPropertyId}</strong>. Only its machines can be selected.
      </div>

      <div>
        <label htmlFor="plan-title" className="text-sm font-semibold">Plan name</label>
        <input id="plan-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-border px-3" aria-describedby={fieldErrors.title ? "plan-title-error" : undefined} />
        {fieldErrors.title && <p id="plan-title-error" className="mt-1 text-sm text-red-700">{fieldErrors.title}</p>}
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">Machines</legend>
        <p className="mt-1 text-sm text-muted-foreground">{selectedMachineNames.length} selected for the active property</p>
        <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
          {machines.length > 0 ? machines.map((machine) => (
            <label key={machine.machine_id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted">
              <input type="checkbox" checked={form.machineIds.includes(machine.machine_id)} onChange={() => toggleMachine(machine.machine_id)} className="h-5 w-5" />
              <span className="min-w-0"><span className="block truncate font-medium">{machine.name}</span><span className="text-xs text-muted-foreground">{machine.machine_id}</span></span>
            </label>
          )) : <p className="p-3 text-sm text-muted-foreground">No machines are available for this property.</p>}
        </div>
        {fieldErrors.machineIds && <p className="mt-1 text-sm text-red-700">{fieldErrors.machineIds}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="plan-start" className="text-sm font-semibold">First due date and time</label>
          <input id="plan-start" type="datetime-local" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-border px-3" />
          <p className="mt-1 text-xs text-muted-foreground">Entered in your browser&apos;s local time; recurrence follows the property tenant&apos;s timezone.</p>
          {fieldErrors.startDate && <p className="mt-1 text-sm text-red-700">{fieldErrors.startDate}</p>}
        </div>
        <div>
          <label htmlFor="plan-frequency" className="text-sm font-semibold">Frequency</label>
          <select id="plan-frequency" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-border px-3">
            {FREQUENCIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {form.frequency === "custom" && (
          <div>
            <label htmlFor="plan-custom-days" className="text-sm font-semibold">Repeat every (days)</label>
            <input id="plan-custom-days" type="number" min="1" value={form.customDays} onChange={(event) => setForm({ ...form, customDays: event.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-border px-3" />
            {fieldErrors.customDays && <p className="mt-1 text-sm text-red-700">{fieldErrors.customDays}</p>}
          </div>
        )}
        <div>
          <label htmlFor="plan-lead-days" className="text-sm font-semibold">Generate work form before due date (days)</label>
          <input id="plan-lead-days" type="number" min="0" value={form.leadTimeDays} onChange={(event) => setForm({ ...form, leadTimeDays: event.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-border px-3" />
          {fieldErrors.leadTimeDays && <p className="mt-1 text-sm text-red-700">{fieldErrors.leadTimeDays}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="plan-procedure-template" className="text-sm font-semibold">Maintenance procedure template</label>
        <select id="plan-procedure-template" value={form.procedureTemplate} onChange={(event) => setForm({ ...form, procedureTemplate: event.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-border px-3">
          <option value="">No template</option>
          {procedures.map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.name}</option>)}
        </select>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">Topics</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {topics.map((topic) => (
            <label key={topic.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border p-2">
              <input type="checkbox" checked={form.topicIds.includes(topic.id)} onChange={() => toggleTopic(topic.id)} className="h-5 w-5" />
              <span>{topic.title}</span>
            </label>
          ))}
          {topics.length === 0 && <p className="text-sm text-muted-foreground">No topics are available.</p>}
        </div>
      </fieldset>

      <div className="grid gap-4">
        <div><label htmlFor="plan-notes" className="text-sm font-semibold">Notes</label><textarea id="plan-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-border p-3" /></div>
        <div><label htmlFor="plan-procedure" className="text-sm font-semibold">Procedure details</label><textarea id="plan-procedure" value={form.procedure} onChange={(event) => setForm({ ...form, procedure: event.target.value })} rows={4} className="mt-1 w-full rounded-md border border-border p-3" /></div>
        <div><label htmlFor="plan-remarks" className="text-sm font-semibold">Remarks</label><textarea id="plan-remarks" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} rows={2} className="mt-1 w-full rounded-md border border-border p-3" /></div>
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-5 w-5" />
        <span className="font-medium">Active recurring plan</span>
      </label>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Link href="/dashboard/preventive-maintenance/plans" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 font-semibold">Cancel</Link>
        <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-5 py-2 font-semibold text-white disabled:opacity-60">
          {submitting ? "Saving…" : planId ? "Save changes" : "Create master plan"}
        </button>
      </div>
    </form>
  );
}
