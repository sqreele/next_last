"use client";

import { useFormikContext } from "formik";
import { type FormValues, type TFunction } from "./create-job-validation";
import { PriorityBadge, StatusBadge, SectionCard } from "@/app/components/pcms-ui";
import type { Machine } from "@/app/lib/MachineService";
import type { Area } from "@/app/lib/types";
import type { MaintenanceProcedureTemplate } from "@/app/lib/maintenanceProcedures";

interface Props {
  t: TFunction;
  selectedMachine?: Machine;
  selectedPropertyLabel: string;
  areas: Area[];
  pmTemplates: MaintenanceProcedureTemplate[];
  assignedTo: string;
  stepStatus: boolean[];
}
export function CreateJobSummary({ t, selectedMachine, selectedPropertyLabel, areas, pmTemplates, assignedTo, stepStatus }: Props) {
  const { values } = useFormikContext<FormValues>();
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-28 space-y-4">
        <SectionCard
          title={t("createJob.summary.title")}
          description={t("createJob.summary.desc")}
        >
          <dl className="space-y-3 text-sm">
            {values.locationType === "machine" && <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("createJob.machine")}</dt>
              <dd className="text-right font-semibold">{selectedMachine?.name || "—"}</dd>
            </div>}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.property")}
              </dt>
              <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                {selectedPropertyLabel ||
                  t("createJob.error.selectActiveProperty")}
              </dd>
            </div>
            {values.locationType !== "machine" && <>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.area")}
              </dt>
              <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                {areas.find(
                  (area) => area.id === values.area_id,
                )?.name || t("createJob.selectAreaOptional")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.roomNumber")}
              </dt>
              <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                {values.room?.name ||
                  t("createJob.selectRoomNumber")}
              </dd>
            </div>
            </>}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t(values.locationType === "machine" ? "createJob.maintenanceTemplate" : "createJob.category")}
              </dt>
              <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                {values.locationType === "machine"
                  ? pmTemplates.find((template) => template.id === values.procedure_template)?.name || "—"
                  : values.topic.title || t("createJob.category")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.status")}
              </dt>
              <dd>
                <StatusBadge
                  status={values.status}
                  size="sm"
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.priority")}
              </dt>
              <dd>
                <PriorityBadge priority={values.priority} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.summary.assignedTo")}
              </dt>
              <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                {assignedTo || t("createJob.summary.chiefReview")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.summary.beforeCount")}
              </dt>
              <dd className="font-semibold text-foreground">
                {values.files.length}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("createJob.summary.afterCount")}
              </dt>
              <dd className="font-semibold text-foreground">
                {values.afterFiles.length}
              </dd>
            </div>
          </dl>
        </SectionCard>
        <SectionCard
          title={t("createJob.progress.title")}
          description={t("createJob.progress.desc")}
        >
          <div className="space-y-3">
            {(
              [
                [
                  t("createJob.step.jobDetails"),
                  stepStatus[0],
                ],
                [t("createJob.step.location"), stepStatus[1]],
                [t(values.locationType === "machine" ? "createJob.maintenanceTemplate" : "createJob.step.category"), stepStatus[2]],
                [
                  t("createJob.step.additional"),
                  stepStatus[3],
                ],
                [t("createJob.step.photos"), stepStatus[4]],
              ] as Array<[string, boolean]>
            ).map(([label, done]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 break-words font-medium text-muted-foreground [overflow-wrap:anywhere]">
                  {label}
                </span>
                <span
                  className={`inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {done
                    ? t("createJob.progress.done")
                    : t("createJob.progress.open")}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </aside>
  );
}
