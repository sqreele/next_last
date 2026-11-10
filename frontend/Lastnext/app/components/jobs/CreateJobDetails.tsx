"use client";

import { useFormikContext } from "formik";
import { type FormValues, type TFunction } from "./create-job-validation";
import { Field } from "formik";
import axios from "axios";
import { AlertCircle, ClipboardList, Check } from "lucide-react";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { StatusBadge } from "@/app/components/pcms-ui";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/app/components/ui/select";
import { getStatusConfig } from "@/app/design-system/status-config";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, JOB_TYPES, SECTION_CARD_CLASS, FIELD_BASE_CLASS } from "./create-job-config";
import { SectionTitle, RequiredMark } from "./create-job-ui";

export function CreateJobDetails({ t }: { t: TFunction }) {
  const { values, errors, touched, submitCount, setFieldValue, setFieldTouched, isSubmitting } = useFormikContext<FormValues>();
  return (
    <div
      id="cj-step-1"
      className={`${SECTION_CARD_CLASS} lg:col-span-2`}
    >
      <SectionTitle
        icon={ClipboardList}
        title={t("createJob.section.jobInfo")}
        description={t("createJob.section.jobInfoDesc")}
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        {/* Description */}
        <div className="md:col-span-2 space-y-2">
          <Label
            htmlFor="description"
            className="text-sm font-semibold text-foreground"
          >
            {t("createJob.description")} <RequiredMark />
          </Label>
          <Field
            as={Textarea}
            id="description"
            name="description"
            placeholder={t(
              "createJob.descriptionPlaceholder",
            )}
            disabled={isSubmitting}
            className={`min-h-28 w-full rounded-lg p-3 text-sm transition-colors ${
              touched.description && errors.description
                ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                : FIELD_BASE_CLASS
            } pcms-textarea resize-none focus:outline-hidden focus:ring-2`}
          />
          {(touched.description || submitCount > 0) &&
            errors.description && (
              <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {errors.description}
              </p>
            )}
        </div>

        {/* Status and Priority */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">
            {t("createJob.status")}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <Select
            value={values.status}
            onValueChange={(value) => {
              setFieldValue("status", value);
              if (value !== "completed") {
                values.afterImageTokens.forEach((token) => {
                  void axios.delete(
                    `/api/jobs/pending-images?token=${encodeURIComponent(token)}`,
                  );
                });
                setFieldValue("afterFiles", []);
                setFieldValue("afterImageTokens", []);
              }
              setFieldTouched("status", true, false);
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger
              className={`h-11 rounded-lg font-semibold transition-colors ${
                (touched.status || submitCount > 0) &&
                errors.status
                  ? "border border-red-400 bg-red-50 text-red-900"
                  : getStatusConfig(values.status).className ||
                    FIELD_BASE_CLASS
              }`}
            >
              <SelectValue
                placeholder={t("createJob.selectStatus")}
              />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className={
                    getStatusConfig(option.value).optionClassName
                  }
                >
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("createJob.selected")}
            </span>
            <StatusBadge status={values.status} size="sm" />
          </div>
          {(touched.status || submitCount > 0) &&
            errors.status && (
              <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {errors.status}
              </p>
            )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">
            {t("createJob.priority")}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <div
            className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${(touched.priority || submitCount > 0) && errors.priority ? "rounded-lg p-1 ring-2 ring-destructive/20" : ""}`}
            role="radiogroup"
            aria-label={t("createJob.priority")}
          >
            {PRIORITY_OPTIONS.map((option) => {
              const active =
                values.priority === option.value;
              const colorMap: Record<string, string> = {
                low: active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
                medium: active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
                high: active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
                critical: active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
              };
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isSubmitting}
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setFieldValue("priority", option.value);
                    setFieldTouched(
                      "priority",
                      true,
                      false,
                    );
                  }}
                  className={`min-h-11 touch-manipulation rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${colorMap[option.value]}`}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>
          {(touched.priority || submitCount > 0) &&
            errors.priority && (
              <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {errors.priority}
              </p>
            )}
        </div>

        {values.locationType !== "machine" && (
        <div className="space-y-2 md:col-span-2">
          <Label className="text-sm font-semibold text-foreground">
            {t("createJob.jobType")} <RequiredMark />
          </Label>
          <div
            className="grid gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label={t("createJob.jobType")}
          >
            {JOB_TYPES.map((type) => {
              const active =
                type.key === "work_order"
                  ? !values.is_defective &&
                    !values.is_preventivemaintenance
                  : type.key === "defect"
                    ? values.is_defective
                    : values.is_preventivemaintenance;
              return (
                <button
                  key={type.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isSubmitting || values.locationType === "machine"}
                  onClick={() => {
                    setFieldValue(
                      "is_defective",
                      type.key === "defect",
                    );
                    setFieldValue(
                      "is_preventivemaintenance",
                      type.key === "pm",
                    );
                  }}
                  className={`min-h-[72px] touch-manipulation rounded-lg border p-3 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
                    active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <type.icon
                      className="h-5 w-5"
                      aria-hidden
                    />
                    {t(type.labelKey)}
                    {active && (
                      <Check
                        className="ml-auto h-4 w-4"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                    {t(type.descriptionKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
