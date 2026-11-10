"use client";

import { useFormikContext } from "formik";
import { type FormValues, type TFunction } from "./create-job-validation";
import { Field } from "formik";
import { AlertCircle, Info } from "lucide-react";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { SECTION_CARD_CLASS, FIELD_BASE_CLASS } from "./create-job-config";
import { SectionTitle } from "./create-job-ui";

export function CreateJobRemarks({ t }: { t: TFunction }) {
  const { touched, errors, submitCount, isSubmitting } = useFormikContext<FormValues>();
  return (
    <div id="cj-step-3" className={SECTION_CARD_CLASS}>
      <SectionTitle
        icon={Info}
        title={t("createJob.section.additional")}
        description={t("createJob.section.additionalDesc")}
      />

      <div className="space-y-4 sm:space-y-6">
        {/* Remarks */}
        <div className="space-y-2">
          <Label
            htmlFor="remarks"
            className="text-sm font-semibold text-foreground"
          >
            {t("createJob.remarks")}
          </Label>
          <Field
            as={Textarea}
            id="remarks"
            name="remarks"
            placeholder={t("createJob.remarksPlaceholder")}
            disabled={isSubmitting}
            className={`min-h-28 w-full rounded-lg p-3 text-sm transition-colors ${
              (touched.remarks || submitCount > 0) &&
              errors.remarks
                ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                : FIELD_BASE_CLASS
            } pcms-textarea resize-none focus:outline-hidden focus:ring-2`}
          />
          {(touched.remarks || submitCount > 0) &&
            errors.remarks && (
              <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {errors.remarks}
              </p>
            )}
        </div>

      </div>
    </div>
  );
}
