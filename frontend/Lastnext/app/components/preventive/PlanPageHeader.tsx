"use client";

import { useT } from "@/app/lib/i18n/LocaleProvider";

export function PlanPageHeader({ mode, planId }: { mode: "create" | "edit"; planId?: string }) {
  const t = useT();
  return (
    <div className="mb-5">
      <p className="text-sm font-semibold text-purple-700">{t("pmPlanForm.eyebrow")}</p>
      <h1 className="text-2xl font-bold text-foreground">
        {mode === "create" ? t("pmPlanForm.createTitle") : t("pmPlanForm.editTitle")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "create" ? t("pmPlanForm.pageHint") : `#${planId}`}
      </p>
    </div>
  );
}
