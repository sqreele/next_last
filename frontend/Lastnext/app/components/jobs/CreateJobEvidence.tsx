"use client";

import { useFormikContext } from "formik";
import { type FormValues, type TFunction } from "./create-job-validation";
import { ImagePlus } from "lucide-react";
import { Label } from "@/app/components/ui/label";
import ImmediateImageUpload from "./ImmediateImageUpload";
import { formatMessage, MAX_BEFORE_FILES, MAX_AFTER_FILES } from "./create-job-validation";
import { SECTION_CARD_CLASS } from "./create-job-config";
import { SectionTitle } from "./create-job-ui";

interface Props {
  t: TFunction;
  activePropertyId: string | null;
  setBeforeImagesBusy: (busy: boolean) => void;
  setAfterImagesBusy: (busy: boolean) => void;
}
export function CreateJobEvidence({ t, activePropertyId, setBeforeImagesBusy, setAfterImagesBusy }: Props) {
  const { values, errors, touched, submitCount, setFieldValue, setFieldTouched, isSubmitting } = useFormikContext<FormValues>();
  return (
    <div
      id="cj-step-4"
      className={`${SECTION_CARD_CLASS} lg:col-span-2`}
    >
      <SectionTitle
        icon={ImagePlus}
        title={t("createJob.section.images")}
        description={t("createJob.section.imagesDesc")}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">
            {formatMessage(t("createJob.beforePhoto"), {
              max: MAX_BEFORE_FILES,
            })}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <ImmediateImageUpload
            key={`before:${activePropertyId || "none"}`}
            imageType="before"
            propertyId={activePropertyId || ""}
            onChange={(selectedFiles, tokens) => {
              setFieldValue("files", selectedFiles, false);
              setFieldValue("beforeImageTokens", tokens, false);
              setFieldTouched("files", true, false);
            }}
            onBusyChange={setBeforeImagesBusy}
            error={
              (touched.files || submitCount > 0) &&
              typeof errors.files === "string"
                ? errors.files
                : undefined
            }
            touched={Boolean(
              touched.files || submitCount > 0,
            )}
            disabled={isSubmitting || !activePropertyId}
            maxFiles={MAX_BEFORE_FILES}
          />
          <p className="text-xs font-medium text-muted-foreground sm:text-sm">
            {formatMessage(t("createJob.beforePhotoHint"), {
              max: MAX_BEFORE_FILES,
            })}
          </p>
        </div>

        {values.status === "completed" && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">
              {formatMessage(t("createJob.afterPhoto"), {
                max: MAX_AFTER_FILES,
              })}
            </Label>
            <ImmediateImageUpload
              key={`after:${activePropertyId || "none"}`}
              imageType="after"
              propertyId={activePropertyId || ""}
              onChange={(selectedFiles, tokens) => {
                setFieldValue("afterFiles", selectedFiles, false);
                setFieldValue("afterImageTokens", tokens, false);
                setFieldTouched(
                  "afterFiles",
                  true,
                  false,
                );
              }}
              onBusyChange={setAfterImagesBusy}
              error={
                (touched.afterFiles || submitCount > 0) &&
                typeof errors.afterFiles === "string"
                  ? errors.afterFiles
                  : undefined
              }
              touched={Boolean(
                touched.afterFiles || submitCount > 0,
              )}
              disabled={isSubmitting || !activePropertyId}
              maxFiles={MAX_AFTER_FILES}
            />
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">
              {formatMessage(t("createJob.afterPhotoHint"), {
                max: MAX_AFTER_FILES,
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
