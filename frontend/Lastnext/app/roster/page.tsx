"use client";

import { addDays, format, parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type DayLabel = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type LeaveType = "PH" | "VC";

type Staff = {
  id: string;
  name: string;
  phAllowance: number;
  vcAllowance: number;
};

type LeaveEntry = {
  id: number;
  staffId: string;
  week: number;
  day: DayLabel;
  type: LeaveType;
  note?: string;
};

type RotationState = Record<number, Record<string, DayLabel[]>>;

type ShiftStart = "08:00" | "14:00" | "11:00" | "09:00";

type LeaveFormState = {
  staffId: string;
  type: LeaveType;
  week: number;
  day: DayLabel;
  note: string;
};

const dayLabels: DayLabel[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const staffSeed: Staff[] = [
  { id: "A", name: "Staff A", phAllowance: 16, vcAllowance: 10 },
  { id: "B", name: "Staff B", phAllowance: 16, vcAllowance: 10 },
  { id: "C", name: "Staff C", phAllowance: 16, vcAllowance: 10 },
  { id: "D", name: "Staff D", phAllowance: 16, vcAllowance: 10 },
];

const staffAId = "A";
const staffAFixedShiftLabel: ShiftStart = "09:00";
const standbyShiftLabel: ShiftStart = "11:00";

const offPairs: DayLabel[][] = [
  ["Mon", "Tue"],
  ["Tue", "Wed"],
  ["Wed", "Thu"],
  ["Thu", "Fri"],
  ["Fri", "Sat"],
  ["Sat", "Sun"],
];

const defaultStaffOffDays: Partial<Record<string, DayLabel[]>> = {
  A: ["Sat", "Sun"],
};

const createInitialRotation = (staffList: Staff[]): RotationState => {
  const initial: RotationState = {};

  for (let week = 1; week <= 53; week += 1) {
    const baseIndex = (week - 1) % offPairs.length;
    const pickPair = (offset: number) => offPairs[(baseIndex + offset) % offPairs.length];

    const weekRotation: Record<string, DayLabel[]> = {};

    staffList.forEach((member, index) => {
      weekRotation[member.id] = defaultStaffOffDays[member.id] ?? pickPair(index * 2);
    });

    initial[week] = weekRotation;
  }

  return initial;
};

const normalizeDay = (value: unknown): DayLabel | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().slice(0, 3).toLowerCase();
  const match = dayLabels.find((day) => day.toLowerCase() === trimmed);
  return match ?? null;
};

const formatRangeLabel = (weekStart: Date, week: number) => {
  const startDate = addDays(weekStart, (week - 1) * 7);
  const endDate = addDays(startDate, 6);
  return `Week ${week} • ${format(startDate, "dd MMM")}–${format(endDate, "dd MMM")}`;
};

const getWeekStartDate = (value: string) => {
  if (!value) {
    return new Date();
  }
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const buildWeekDates = (weekStart: Date, week: number) =>
  dayLabels.map((day, index) => ({
    day,
    date: addDays(weekStart, (week - 1) * 7 + index),
  }));

const countLeavesByType = (leaves: LeaveEntry[], staffId: string, type: LeaveType) =>
  leaves.filter((leave) => leave.staffId === staffId && leave.type === type).length;

const getLeaveForDay = (leaves: LeaveEntry[], staffId: string, week: number, day: DayLabel) =>
  leaves.find((leave) => leave.staffId === staffId && leave.week === week && leave.day === day);

const getStaffWeekendOffDays = () => defaultStaffOffDays.A ?? ["Sat", "Sun"];

export default function RosterPage() {
  const [staff, setStaff] = useState<Staff[]>(staffSeed);
  const [rotation, setRotation] = useState<RotationState>(() => createInitialRotation(staffSeed));
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [weekStartInput, setWeekStartInput] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState<LeaveFormState>({
    staffId: "B",
    type: "PH",
    week: 1,
    day: "Mon",
    note: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const weekStartDate = useMemo(() => getWeekStartDate(weekStartInput), [weekStartInput]);

  const weekDates = useMemo(
    () => buildWeekDates(weekStartDate, selectedWeek),
    [selectedWeek, weekStartDate],
  );

  const weekLabel = useMemo(
    () => formatRangeLabel(weekStartDate, selectedWeek),
    [selectedWeek, weekStartDate],
  );

  const nonAStaff = useMemo(
    () => staff.filter((member) => member.id !== staffAId),
    [staff],
  );

  const updateRotation = (week: number, staffId: string, day: DayLabel) => {
    setRotation((prev) => {
      const weekData = prev[week] ?? {};
      const currentDays = weekData[staffId] ?? [];
      const hasDay = currentDays.includes(day);

      const nextDays = hasDay
        ? currentDays.filter((entry) => entry !== day)
        : [...currentDays, day];

      return {
        ...prev,
        [week]: {
          ...weekData,
          [staffId]: nextDays,
        },
      };
    });
  };

  const handleToggleOff = (staffId: string, day: DayLabel) => {
    if (staffId === staffAId) {
      if (getStaffWeekendOffDays().includes(day)) {
        setNotice("Staff A is always OFF on Saturday and Sunday.");
        return;
      }
      setNotice("Staff A works 09:00 on weekdays and cannot be marked OFF.");
      return;
    }
    const existingLeave = getLeaveForDay(leaves, staffId, selectedWeek, day);
    if (existingLeave) {
      setNotice("Remove leave before setting OFF for this day.");
      return;
    }

    setNotice(null);
    updateRotation(selectedWeek, staffId, day);
  };

  const getOffDays = (week: number, staffId: string) => {
    if (staffId === staffAId) {
      return getStaffWeekendOffDays();
    }
    return rotation[week]?.[staffId] ?? [];
  };

  const getShiftPreference = (week: number, staffId: string): "08:00" | "14:00" => {
    const staffIndex = Math.max(
      0,
      nonAStaff.findIndex((member) => member.id === staffId),
    );
    const basePreference = staffIndex % 2 === 0 ? "08:00" : "14:00";
    return week % 2 === 0 ? (basePreference === "08:00" ? "14:00" : "08:00") : basePreference;
  };

  const dailyAssignments = useMemo(() => {
    const counts: Record<string, number> = {};
    nonAStaff.forEach((member) => {
      counts[member.id] = 0;
    });

    return dayLabels.reduce<Record<DayLabel, { shift08?: string; shift14?: string; standby?: string }>>(
      (accumulator, day) => {
        const available = nonAStaff
          .filter((member) => !getOffDays(selectedWeek, member.id).includes(day))
          .filter(
            (member) =>
              !leaves.some(
                (leave) =>
                  leave.week === selectedWeek &&
                  leave.day === day &&
                  leave.staffId === member.id,
              ),
          );

        const assigned = new Set<string>();
        const pickForShift = (shift: "08:00" | "14:00") => {
          const preferred = available.find(
            (member) => !assigned.has(member.id) && getShiftPreference(selectedWeek, member.id) === shift,
          );
          const fallback = available.find((member) => !assigned.has(member.id));
          const chosen = preferred ?? fallback;
          if (chosen) {
            assigned.add(chosen.id);
            counts[chosen.id] = (counts[chosen.id] ?? 0) + 1;
            return chosen.id;
          }
          return undefined;
        };

        const shift08 = pickForShift("08:00");
        const shift14 = pickForShift("14:00");

        let standby: string | undefined;
        if (!shift08 || !shift14) {
          const remaining = available.filter((member) => !assigned.has(member.id));
          if (remaining.length > 0) {
            const chosen = [...remaining].sort((a, b) => {
              const countDiff = (counts[a.id] ?? 0) - (counts[b.id] ?? 0);
              return countDiff !== 0 ? countDiff : a.id.localeCompare(b.id);
            })[0];
            standby = chosen?.id;
            if (standby) {
              assigned.add(standby);
              counts[standby] = (counts[standby] ?? 0) + 1;
            }
          }
        }

        accumulator[day] = { shift08, shift14, standby };
        return accumulator;
      },
      {} as Record<DayLabel, { shift08?: string; shift14?: string; standby?: string }>,
    );
  }, [leaves, nonAStaff, rotation, selectedWeek]);

  const coverageByDay = dayLabels.map((day) => {
    const offCount = nonAStaff.filter((member) =>
      getOffDays(selectedWeek, member.id).includes(day),
    ).length;
    const leaveCount = leaves.filter(
      (leave) => leave.week === selectedWeek && leave.day === day && leave.staffId !== staffAId,
    ).length;
    const workingCount = nonAStaff.length - offCount - leaveCount;

    return {
      day,
      offCount,
      leaveCount,
      workingCount,
      target: 2,
      shift08: dailyAssignments[day]?.shift08,
      shift14: dailyAssignments[day]?.shift14,
      standby: dailyAssignments[day]?.standby,
    };
  });

  const getShiftForStaffDay = (staffId: string, day: DayLabel) => {
    if (staffId === staffAId) {
      return getOffDays(selectedWeek, staffId).includes(day) ? null : staffAFixedShiftLabel;
    }
    const assignment = dailyAssignments[day];
    if (assignment?.shift08 === staffId) {
      return "08:00" as const;
    }
    if (assignment?.shift14 === staffId) {
      return "14:00" as const;
    }
    if (assignment?.standby === staffId) {
      return standbyShiftLabel;
    }
    return null;
  };

  const warnings = useMemo(() => {
    const warningList: string[] = [];

    staff.forEach((member) => {
      const offDays = getOffDays(selectedWeek, member.id);
      if (member.id !== staffAId && offDays.length !== 2) {
        warningList.push(
          `${member.name} has ${offDays.length} OFF day(s) in week ${selectedWeek}.`,
        );
      }
      if (member.id !== staffAId && offDays.length === 2) {
        const indices = offDays.map((day) => dayLabels.indexOf(day)).sort((a, b) => a - b);
        if (indices[1] - indices[0] !== 1) {
          warningList.push(
            `${member.name} OFF days are not consecutive in week ${selectedWeek}.`,
          );
        }
      }
    });

    coverageByDay.forEach((coverage) => {
      if (!coverage.shift08 || !coverage.shift14) {
        warningList.push(
          `${coverage.day}: missing ${!coverage.shift08 ? "08:00" : ""}${
            !coverage.shift08 && !coverage.shift14 ? " & " : ""
          }${!coverage.shift14 ? "14:00" : ""} coverage.`,
        );
      }
      if (coverage.standby) {
        warningList.push(`${coverage.day}: standby assigned at 11:00 (${coverage.standby}).`);
      }
    });

    return warningList;
  }, [coverageByDay, selectedWeek, staff]);

  const fetchLeaves = async () => {
    try {
      const response = await fetch("/api/roster-leaves");
      if (!response.ok) {
        setNotice("Unable to load saved leave entries.");
        return;
      }
      const data = (await response.json()) as Array<{
        id: number;
        staff_id: string;
        week: number;
        day: DayLabel;
        type: LeaveType;
        note?: string | null;
      }>;
      const mapped = data.map((leave) => ({
        id: leave.id,
        staffId: leave.staff_id,
        week: leave.week,
        day: leave.day,
        type: leave.type,
        note: leave.note ?? undefined,
      }));
      setLeaves(mapped);
      setNotice(null);
    } catch (error) {
      console.error("Failed to load roster leaves", error);
      setNotice("Unable to load saved leave entries.");
    }
  };

  useEffect(() => {
    void fetchLeaves();
  }, []);

  const handleAddLeave = async () => {
    const staffMember = staff.find((member) => member.id === leaveForm.staffId);
    if (!staffMember) {
      setNotice("Select a valid staff member.");
      return;
    }

    const offDays = getOffDays(leaveForm.week, leaveForm.staffId);
    if (offDays.includes(leaveForm.day)) {
      setNotice("Cannot add leave on an OFF day.");
      return;
    }

    const duplicate = leaves.some(
      (leave) =>
        leave.staffId === leaveForm.staffId &&
        leave.week === leaveForm.week &&
        leave.day === leaveForm.day,
    );
    if (duplicate) {
      setNotice("Duplicate leave for this staff/week/day.");
      return;
    }

    const usedCount = countLeavesByType(leaves, leaveForm.staffId, leaveForm.type);
    const allowance =
      leaveForm.type === "PH" ? staffMember.phAllowance : staffMember.vcAllowance;
    if (usedCount >= allowance) {
      setNotice("Leave allowance exceeded.");
      return;
    }

    try {
      const response = await fetch("/api/roster-leaves", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staff_id: leaveForm.staffId,
          week: leaveForm.week,
          day: leaveForm.day,
          type: leaveForm.type,
          note: leaveForm.note || undefined,
        }),
      });

      if (!response.ok) {
        setNotice("Unable to save leave entry.");
        return;
      }

      const saved = (await response.json()) as {
        id: number;
        staff_id: string;
        week: number;
        day: DayLabel;
        type: LeaveType;
        note?: string | null;
      };

      const newLeave: LeaveEntry = {
        id: saved.id,
        staffId: saved.staff_id,
        week: saved.week,
        day: saved.day,
        type: saved.type,
        note: saved.note ?? undefined,
      };

      setLeaves((prev) => [...prev, newLeave]);
      setNotice(null);
    } catch (error) {
      console.error("Failed to save roster leave", error);
      setNotice("Unable to save leave entry.");
    }
  };

  const handleRemoveLeave = async (leaveId: number) => {
    try {
      const response = await fetch(`/api/roster-leaves/${leaveId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setNotice("Unable to delete leave entry.");
        return;
      }
      setLeaves((prev) => prev.filter((leave) => leave.id !== leaveId));
      setNotice(null);
    } catch (error) {
      console.error("Failed to delete roster leave", error);
      setNotice("Unable to delete leave entry.");
    }
  };

  const handleRepeatCycle = () => {
    setRotation((prev) => {
      const nextRotation: RotationState = { ...prev };
      for (let week = 8; week <= 53; week += 1) {
        const sourceWeek = ((week - 1) % 7) + 1;
        const sourceWeekData = prev[sourceWeek] ?? {};
        const nextWeek: Record<string, DayLabel[]> = {
          ...nextRotation[week],
        };

        staff.forEach((member) => {
          nextWeek[member.id] = [...(sourceWeekData[member.id] ?? [])];
        });

        nextRotation[week] = nextWeek;
      }
      return nextRotation;
    });
    setNotice("Applied 7-week rotation pattern to weeks 8-53.");
  };

  const handleImport = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });

    const setupSheet = workbook.Sheets["Setup"];
    if (setupSheet) {
      const rows = XLSX.utils.sheet_to_json<{
        Staff?: string;
        PH_allowance?: number;
        VC_allowance?: number;
      }>(setupSheet);
      setStaff((prev) =>
        prev.map((member) => {
          const match = rows.find((row) => row.Staff?.trim().startsWith(member.id));
          if (!match) {
            return member;
          }
          return {
            ...member,
            phAllowance: match.PH_allowance ?? member.phAllowance,
            vcAllowance: match.VC_allowance ?? member.vcAllowance,
          };
        }),
      );
    }

    const rotationSheet = workbook.Sheets["Rotation_53w"];
    if (rotationSheet) {
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(rotationSheet);
      setRotation((prev) => {
        const nextRotation: RotationState = { ...prev };
        rows.forEach((row) => {
          const week = Number(row.Week);
          if (!week || week < 1 || week > 53) {
            return;
          }
          const staffIds = ["A", "B", "C", "D"];
          const updatedWeek: Record<string, DayLabel[]> = { ...nextRotation[week] };
          staffIds.forEach((id) => {
            const off1 = normalizeDay(row[`${id}_Off1`]);
            const off2 = normalizeDay(row[`${id}_Off2`]);
            const entries = [off1, off2].filter(Boolean) as DayLabel[];
            if (entries.length) {
              updatedWeek[id] = entries;
            }
          });
          nextRotation[week] = updatedWeek;
        });
        return nextRotation;
      });
    }

    setNotice("Imported rotation data from Excel.");
  };

  const handleExport = () => {
    const workbook = XLSX.utils.book_new();

    const setupRows = staff.map((member) => ({
      Staff: member.id,
      PH_allowance: member.phAllowance,
      VC_allowance: member.vcAllowance,
    }));

    const legendRows = [
      ["Roster Management Legend"],
      ["Coverage", "08:00 and 14:00 (1 staff each)"],
      ["Staff A", "Fixed 09:00 shift, OFF Sat/Sun"],
      ["Standby coverage", "11:00 (used only if 08:00/14:00 missing)"],
      ["Target staffing (excluding Staff A)", "2 working staff per day"],
      ["Rules"],
      ["Base shifts (08:00/14:00)", "Daily coverage, exclude Staff A"],
      ["Shift change (non-A)", "Weekly toggle between 08:00 and 14:00"],
      ["OFF days (non-A)", "2 per staff per week (consecutive)"],
    ];

    const rotationRows = Array.from({ length: 53 }, (_, index) => {
      const week = index + 1;
      const weekRotation = rotation[week] ?? {};
      const row: Record<string, string | number> = {
        Week: week,
      };
      ["A", "B", "C", "D"].forEach((id) => {
        const offDays = id === staffAId ? getStaffWeekendOffDays() : weekRotation[id] ?? [];
        row[`${id}_Off1`] = offDays[0] ?? "";
        row[`${id}_Off2`] = offDays[1] ?? "";
        const phDays = leaves.filter(
          (leave) => leave.week === week && leave.staffId === id && leave.type === "PH",
        ).length;
        const vcDays = leaves.filter(
          (leave) => leave.week === week && leave.staffId === id && leave.type === "VC",
        ).length;
        row[`${id}_PH_days`] = phDays;
        row[`${id}_VC_days`] = vcDays;
      });
      return row;
    });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(setupRows), "Setup");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(legendRows),
      "Legend",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rotationRows),
      "Rotation_53w",
    );

    XLSX.writeFile(workbook, "roster-management.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Roster Management UI</p>
              <h1 className="text-2xl font-semibold text-slate-900">{weekLabel}</h1>
              <p className="mt-1 text-sm text-slate-500">
                Coverage 08:00 + 14:00 (exclude Staff A) • Staff A 09:00 (Mon-Fri) • Standby 11:00
              </p>
              <p className="text-xs text-slate-400">
                Shift change (non-A staff): weekly toggle 08:00 ↔ 14:00
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Week selector
                <select
                  className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={selectedWeek}
                  onChange={(event) => {
                    const nextWeek = Number(event.target.value);
                    setSelectedWeek(nextWeek);
                    setLeaveForm((prev) => ({ ...prev, week: nextWeek }));
                  }}
                >
                  {Array.from({ length: 53 }, (_, index) => {
                    const week = index + 1;
                    const label = formatRangeLabel(weekStartDate, week);
                    return (
                      <option key={week} value={week}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Week 1 start (Monday)
                <input
                  type="date"
                  value={weekStartInput}
                  onChange={(event) => setWeekStartInput(event.target.value)}
                  className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImport(file);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                >
                  Import Excel
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                >
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={handleRepeatCycle}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Repeat 7-week cycle
                </button>
              </div>
            </div>
          </div>
          {notice ? <p className="mt-3 text-sm text-rose-600">{notice}</p> : null}
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Staff balances</h2>
              <div className="mt-4 space-y-3">
                {staff.map((member) => {
                  const usedPh = countLeavesByType(leaves, member.id, "PH");
                  const usedVc = countLeavesByType(leaves, member.id, "VC");
                  return (
                    <div
                      key={member.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                          <p className="text-xs text-slate-500">PH {member.phAllowance}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">
                            Used {usedPh} / {member.phAllowance}
                          </p>
                          <p className="text-xs text-slate-500">
                            VC {usedVc} / {member.vcAllowance}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Coverage cards</h2>
              <div className="mt-4 space-y-3">
                {coverageByDay.map((coverage) => {
                  const status =
                    coverage.shift08 && coverage.shift14
                      ? "OK"
                      : !coverage.shift08 || !coverage.shift14
                        ? "Under"
                        : "Over";
                  const statusStyle =
                    status === "OK"
                      ? "bg-emerald-100 text-emerald-700"
                      : status === "Under"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700";
                  return (
                    <div
                      key={coverage.day}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{coverage.day}</p>
                        <p className="text-xs text-slate-500">
                          08:00 {coverage.shift08 ?? "—"} • 14:00 {coverage.shift14 ?? "—"} •
                          Standby {coverage.standby ?? "—"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyle}`}
                      >
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Rule check</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {warnings.length === 0 ? (
                  <li className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                    All rules satisfied for this week.
                  </li>
                ) : (
                  warnings.map((warning) => (
                    <li key={warning} className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
                      {warning}
                    </li>
                  ))
                )}
              </ul>
            </section>
          </aside>

          <main className="flex flex-col gap-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Shift roster grid</h2>
              <p className="text-sm text-slate-500">
                Coverage 08:00 + 14:00 (exclude Staff A) • Staff A 09:00 (Mon-Fri) • Standby 11:00
              </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    08:00 coverage
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    14:00 coverage
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Standby 11:00
                  </span>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-24 border-b border-slate-200 bg-white p-3 text-left text-xs font-semibold text-slate-500">
                        Staff
                      </th>
                      {weekDates.map(({ day, date }) => (
                        <th
                          key={day}
                          className="border-b border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-500"
                        >
                          <div className="text-sm font-semibold text-slate-900">{day}</div>
                          <div>{format(date, "dd MMM")}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((member) => (
                      <tr key={member.id}>
                        <td className="sticky left-0 z-10 border-b border-slate-100 bg-white p-3 text-xs font-semibold text-slate-700">
                          {member.name}
                        </td>
                        {dayLabels.map((day) => {
                          const offDays = getOffDays(selectedWeek, member.id);
                          const isOff = offDays.includes(day);
                          const leave = getLeaveForDay(leaves, member.id, selectedWeek, day);
                          const shiftTime = !leave && !isOff ? getShiftForStaffDay(member.id, day) : null;
                          const stateLabel = leave
                            ? leave.type
                            : isOff
                              ? "OFF"
                              : shiftTime === standbyShiftLabel
                                ? "Standby"
                                : "Work";
                          const stateColor = leave
                            ? leave.type === "PH"
                              ? "bg-amber-200 text-amber-900"
                              : "bg-yellow-200 text-yellow-900"
                            : isOff
                              ? "bg-rose-200 text-rose-900"
                              : "bg-white text-slate-700";

                          return (
                            <td key={`${member.id}-${day}`} className="border-b border-slate-100">
                              <button
                                type="button"
                                onClick={() => handleToggleOff(member.id, day)}
                                className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-3 text-xs font-semibold transition ${stateColor} ${
                                  "hover:border-slate-400"
                                }`}
                              >
                                <span>{stateLabel}</span>
                                {shiftTime ? (
                                  <span className="text-[10px] font-normal">{shiftTime}</span>
                                ) : null}
                                {leave?.note ? (
                                  <span className="text-[10px] font-normal">{leave.note}</span>
                                ) : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Leave manager</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-3">
                  <label className="flex flex-col text-sm font-medium text-slate-600">
                    Staff
                    <select
                      value={leaveForm.staffId}
                      onChange={(event) =>
                        setLeaveForm((prev) => ({ ...prev, staffId: event.target.value }))
                      }
                      className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-600">
                    Type
                    <select
                      value={leaveForm.type}
                      onChange={(event) =>
                        setLeaveForm((prev) => ({
                          ...prev,
                          type: event.target.value as LeaveType,
                        }))
                      }
                      className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="PH">PH</option>
                      <option value="VC">VC</option>
                    </select>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-600">
                    Week
                    <select
                      value={leaveForm.week}
                      onChange={(event) =>
                        setLeaveForm((prev) => ({
                          ...prev,
                          week: Number(event.target.value),
                        }))
                      }
                      className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 53 }, (_, index) => {
                        const week = index + 1;
                        return (
                          <option key={week} value={week}>
                            Week {week}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-600">
                    Day
                    <select
                      value={leaveForm.day}
                      onChange={(event) =>
                        setLeaveForm((prev) => ({
                          ...prev,
                          day: event.target.value as DayLabel,
                        }))
                      }
                      className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {dayLabels.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-600">
                    Note
                    <input
                      value={leaveForm.note}
                      onChange={(event) =>
                        setLeaveForm((prev) => ({ ...prev, note: event.target.value }))
                      }
                      className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Optional note"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLeave}
                    className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Add leave
                  </button>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Leaves for week {selectedWeek}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {leaves
                      .filter((leave) => leave.week === selectedWeek)
                      .map((leave) => {
                        const member = staff.find((staffMember) => staffMember.id === leave.staffId);
                        return (
                          <div
                            key={leave.id}
                            className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs text-slate-600 shadow-sm"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {member?.name} • {leave.type}
                              </p>
                              <p>
                                Week {leave.week} • {leave.day}
                                {leave.note ? ` • ${leave.note}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveLeave(leave.id)}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    {leaves.filter((leave) => leave.week === selectedWeek).length === 0 ? (
                      <p className="text-xs text-slate-500">No leave entries for this week.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
