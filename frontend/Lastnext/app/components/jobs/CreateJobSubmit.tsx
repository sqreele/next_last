"use client";

import { useFormikContext } from "formik";
import { type FormValues, type TFunction } from "./create-job-validation";
import { Plus, AlertCircle } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";
import { formatMessage } from "./create-job-validation";

interface Props {
  t: TFunction;
  completionSteps: Array<{ target: string; done: boolean }>;
  beforeImagesBusy: boolean;
  afterImagesBusy: boolean;
}
export function CreateJobSubmit({ t, completionSteps, beforeImagesBusy, afterImagesBusy }: Props) {
  const { isSubmitting } = useFormikContext<FormValues>();
  const completedCount = completionSteps.filter(
    (step) => step.done,
  ).length;
  const firstIncompleteIndex = completionSteps.findIndex(
    (step) => !step.done,
  );
  const firstIncomplete = firstIncompleteIndex + 1;
  const firstIncompleteTarget =
    completionSteps[firstIncompleteIndex]?.target;
  const allReady =
    completedCount === completionSteps.length &&
    !beforeImagesBusy &&
    !afterImagesBusy;
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card px-3 py-3 shadow-soft sm:px-6 md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none"
      style={{
        paddingBottom:
          "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full max-w-none md:max-w-none">
        {!allReady && !isSubmitting && (
          <div className="mb-2 flex flex-col items-stretch gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-semibold text-foreground md:hidden">
            <span className="flex min-w-0 items-start gap-1.5 leading-5">
              <AlertCircle className="h-3.5 w-3.5" />
              {formatMessage(
                t("createJob.mobileProgress"),
                {
                  completed: completedCount,
                  total: completionSteps.length,
                  step: firstIncomplete,
                },
              )}
            </span>
            <button
              type="button"
              className="min-h-11 self-start rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => {
                if (typeof document !== "undefined") {
                  document
                    .getElementById(
                      firstIncompleteTarget || "cj-step-1",
                    )
                    ?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                }
              }}
            >
              {t("createJob.jump")}
            </button>
          </div>
        )}
        <Button
          type="submit"
          disabled={
            isSubmitting || beforeImagesBusy || afterImagesBusy
          }
          aria-busy={isSubmitting}
          onClick={(event) => {
            // If something's missing, jump to the first incomplete step on mobile
            // before the form's own submit validation triggers so the user sees
            // exactly which section needs work.
            if (
              !allReady &&
              typeof document !== "undefined" &&
              window.innerWidth < 1280
            ) {
              event.preventDefault();
              document
                .getElementById(
                  firstIncompleteTarget || "cj-step-1",
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
            }
          }}
          className={`h-12 w-full touch-manipulation rounded-lg text-sm font-semibold text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-100 sm:text-base ${
            allReady
              ? "bg-primary hover:bg-[hsl(var(--primary-hover))] disabled:bg-primary/50"
              : "bg-primary hover:bg-[hsl(var(--primary-hover))] disabled:bg-primary/50"
          }`}
        >
          {isSubmitting ? (
            <div className="flex items-center gap-3">
              <BouncingDotsLoader size="sm" />
              <span>{t("createJob.creating")}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5" />
              <span>
                {allReady
                  ? t("createJob.cta")
                  : t("createJob.ctaFinishStep").replace(
                      "{n}",
                      String(firstIncomplete),
                    )}
              </span>
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}
