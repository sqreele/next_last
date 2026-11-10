interface MachineSummaryInput {
  machine_id: string;
  last_maintenance_date?: string | null;
}

interface JobSummaryInput {
  machine?: { machine_id: string } | null;
  status: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
}

interface MaintenanceSummaryInput {
  machines?: { machine_id: string }[];
  status: string;
  completed_date?: string | null;
}

function timestamp(value?: string | null) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : -Infinity;
}

export function buildMachineSummaries<T extends JobSummaryInput>(
  machines: MachineSummaryInput[], jobs: T[], plans: MaintenanceSummaryInput[],
) {
  const summaries = new Map<string, { latestJob?: T; lastMaintenance?: string; openJobs: number }>();
  const recordMaintenance = (machineId: string, date?: string | null) => {
    const summary = summaries.get(machineId);
    if (summary && timestamp(date) > timestamp(summary.lastMaintenance)) {
      summary.lastMaintenance = date!;
    }
  };
  for (const machine of machines) {
    summaries.set(machine.machine_id, { openJobs: 0 });
    recordMaintenance(machine.machine_id, machine.last_maintenance_date);
  }
  for (const job of jobs) {
    if (!job.machine) continue;
    const summary = summaries.get(job.machine.machine_id);
    if (!summary) continue;
    if (!['completed', 'verified', 'cancelled'].includes(job.status)) summary.openJobs += 1;
    const updated = (value: T) => timestamp(value.updated_at || value.created_at);
    if (!summary.latestJob || updated(job) > updated(summary.latestJob)) summary.latestJob = job;
    if (job.status === 'completed') recordMaintenance(job.machine.machine_id, job.completed_at);
  }
  for (const plan of plans) {
    if (plan.status !== 'completed') continue;
    for (const machine of plan.machines ?? []) recordMaintenance(machine.machine_id, plan.completed_date);
  }
  return summaries;
}
