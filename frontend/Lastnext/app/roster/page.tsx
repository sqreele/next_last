"use client";

import { addDays, format, parseISO } from "date-fns";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type DayLabel = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type LeaveType = "PH" | "VC";

type Staff = {
  id: string;
  name: string;
  phAllowance: number;
  vcAllowance: number;
  isBase?: boolean;
};

type LeaveEntry = {
  id: string;
  staffId: string;
  week: number;
  day: DayLabel;
  type: LeaveType;
  note?: string;
};

type RotationState = Record<number, Record<string, DayLabel[]>>;

type LeaveFormState = {
  staffId: string;
  type: LeaveType;
  week: number;
  day: DayLabel;
  note: string;
};

const dayLabels: DayLabel[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const staffSeed: Staff[] = [
  { id: "A", name: "Staff A", phAllowance: 16, vcAllowance: 10, isBase: true },
  { id: "B", name: "Staff B", phAllowance: 16, vcAllowance: 10 },
  { id: "C", name: "Staff C", phAllowance: 16, vcAllowance: 10 },
  { id: "D", name: "Staff D", phAllowance: 16, vcAllowance: 10 },
];

const baseStaffId = "A";

const offPairs: DayLabel[][] = [
  ["Mon", "Tue"],
  ["Tue", "Wed"],
  ["Wed", "Thu"],
  ["Thu", "Fri"],
  ["Fri", "Sat"],
  ["Sat", "Sun"],
];

const createInitialRotation = (): RotationState => {
  const initial: RotationState = {};

  for (let week = 1; week <= 53; week += 1) {
    const baseIndex = (week - 1) % offPairs.length;
    const pickPair = (offset: number) => offPairs[(baseIndex + offset) % offPairs.length];

    initial[week] = {
      A: ["Sat", "Sun"],
      B: pickPair(0),
      C: pickPair(2),
      D: pickPair(4),
    };
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

const getLeaveKey = (leave: Omit<LeaveEntry, "id">) =>
  `${leave.staffId}-${leave.week}-${leave.day}-${leave.type}`;

const countLeavesByType = (leaves: LeaveEntry[], staffId: string, type: LeaveType) =>
  leaves.filter((leave) => leave.staffId === staffId && leave.type === type).length;

const getLeaveForDay = (leaves: LeaveEntry[], staffId: string, week: number, day: DayLabel) =>
  leaves.find((leave) => leave.staffId === staffId && leave.week === week && leave.day === day);

export default function RosterPage() {
  const [staff, setStaff] = useState<Staff[]>(staffSeed);
  const [rotation, setRotation] = useState<RotationState>(() => createInitialRotation());
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
    if (staffId === baseStaffId) {
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
    if (staffId === baseStaffId) {
      return ["Sat", "Sun"] as DayLabel[];
    }
    return rotation[week]?.[staffId] ?? [];
  };

  const nonBaseStaff = staff.filter((member) => member.id !== baseStaffId);

  const coverageByDay = dayLabels.map((day) => {
    const offCount = nonBaseStaff.filter((member) =>
      getOffDays(selectedWeek, member.id).includes(day),
    ).length;
    const leaveCount = leaves.filter(
      (leave) =>
        leave.week === selectedWeek &&
        leave.day === day &&
        leave.staffId !== baseStaffId,
    ).length;
    const workingCount = nonBaseStaff.length - offCount - leaveCount;

    return {
      day,
      offCount,
      leaveCount,
      workingCount,
      target: 2,
    };
  });

  const warnings = useMemo(() => {
    const warningList: string[] = [];

    staff.forEach((member) => {
      const offDays = getOffDays(selectedWeek, member.id);
      if (offDays.length !== 2) {
        warningList.push(
          `${member.name} has ${offDays.length} OFF day(s) in week ${selectedWeek}.`,
        );
      }
      if (offDays.length === 2) {
        const indices = offDays.map((day) => dayLabels.indexOf(day)).sort((a, b) => a - b);
        if (indices[1] - indices[0] !== 1) {
          warningList.push(
            `${member.name} OFF days are not consecutive in week ${selectedWeek}.`,
          );
        }
      }
    });

    coverageByDay.forEach((coverage) => {
      if (coverage.workingCount !== coverage.target) {
        warningList.push(
          `${coverage.day}: working staff excluding BASE is ${coverage.workingCount}/${coverage.target}.`,
        );
      }
    });

    return warningList;
  }, [coverageByDay, selectedWeek, staff]);

  const handleAddLeave = () => {
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

    const newLeave: LeaveEntry = {
      id: getLeaveKey({
        staffId: leaveForm.staffId,
        week: leaveForm.week,
        day: leaveForm.day,
        type: leaveForm.type,
        note: leaveForm.note,
      }),
      staffId: leaveForm.staffId,
      week: leaveForm.week,
      day: leaveForm.day,
      type: leaveForm.type,
      note: leaveForm.note || undefined,
    };

    setLeaves((prev) => [...prev, newLeave]);
    setNotice(null);
  };

  const handleRemoveLeave = (leaveId: string) => {
    setLeaves((prev) => prev.filter((leave) => leave.id !== leaveId));
  };

  const handleRepeatCycle = () => {
    setRotation((prev) => {
      const nextRotation: RotationState = { ...prev };
      for (let week = 8; week <= 53; week += 1) {
        const sourceWeek = ((week - 1) % 7) + 1;
        nextRotation[week] = {
          ...nextRotation[week],
          A: ["Sat", "Sun"],
          B: [...(prev[sourceWeek]?.B ?? [])],
          C: [...(prev[sourceWeek]?.C ?? [])],
          D: [...(prev[sourceWeek]?.D ?? [])],
        };
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
            if (id === baseStaffId) {
              updatedWeek[id] = ["Sat", "Sun"];
            } else if (entries.length) {
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
      ["Morning Shift", "08:00"],
      ["Night Shift", "14:00"],
      ["Target staffing (excluding BASE)", "2 working staff per day"],
      ["Rules"],
      ["OFF days", "2 per staff per week (consecutive)"],
      ["BASE (A)", "OFF Sat + Sun (locked)"],
    ];

    const rotationRows = Array.from({ length: 53 }, (_, index) => {
      const week = index + 1;
      const weekRotation = rotation[week] ?? {};
      const row: Record<string, string | number> = {
        Week: week,
      };
      ["A", "B", "C", "D"].forEach((id) => {
        const offDays = id === baseStaffId ? ["Sat", "Sun"] : weekRotation[id] ?? [];
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
                Morning 08:00 • Night 14:00
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
                          <p className="text-sm font-semibold text-slate-900">
                            {member.name} {member.isBase ? "(BASE)" : ""}
                          </p>
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
                    coverage.workingCount === coverage.target
                      ? "OK"
                      : coverage.workingCount < coverage.target
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
                          Work {coverage.workingCount} • OFF {coverage.offCount} • Leave {coverage.leaveCount}
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
              <h2 className="text-lg font-semibold text-slate-900">Roster grid</h2>
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
                          {member.name} {member.isBase ? "(BASE)" : ""}
                        </td>
                        {dayLabels.map((day) => {
                          const offDays = getOffDays(selectedWeek, member.id);
                          const isOff = offDays.includes(day);
                          const leave = getLeaveForDay(leaves, member.id, selectedWeek, day);
                          const stateLabel = leave ? leave.type : isOff ? "OFF" : "Work";
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
                                disabled={member.id === baseStaffId}
                                className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-3 text-xs font-semibold transition ${stateColor} ${
                                  member.id === baseStaffId
                                    ? "cursor-not-allowed opacity-70"
                                    : "hover:border-slate-400"
                                }`}
                              >
                                <span>{stateLabel}</span>
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
