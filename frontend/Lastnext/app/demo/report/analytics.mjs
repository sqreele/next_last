export function jobPeriod(job) {
  const date = new Date(job.created);
  if (!job.created || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit",
  }).formatToParts(date);
  return { year: parts.find((part) => part.type === "year").value,
    month: Number(parts.find((part) => part.type === "month").value) };
}

export function aggregateReport(jobs) {
  const monthly = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, total: 0, completed: 0, open: 0, cancelled: 0 }));
  const people = new Map();
  let undated = 0;
  for (const job of jobs) {
    const period = jobPeriod(job);
    const bucket = job.status === "completed" ? "completed" : job.status === "cancelled" ? "cancelled" : "open";
    if (period) {
      monthly[period.month - 1].total++;
      monthly[period.month - 1][bucket]++;
    } else undated++;
    const name = job.technician?.trim() || "";
    if (!people.has(name)) people.set(name, { name, total: 0, completed: 0, open: 0, cancelled: 0 });
    const person = people.get(name);
    person.total++;
    person[bucket]++;
  }
  return { monthly, technicians: [...people.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), undated };
}
