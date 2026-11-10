"use client";

import type React from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { TFunction } from "./create-job-validation";

export function RequiredMark() {
  return (
    <span className="text-destructive" aria-label="required">
      *
    </span>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const circumference = 119.4;
  const offset = circumference - (circumference * percent) / 100;

  return (
    <div className="relative h-[46px] w-[46px] shrink-0">
      <svg
        className="-rotate-90"
        width="46"
        height="46"
        viewBox="0 0 46 46"
        aria-hidden
      >
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="4"
        />
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold text-primary">
        {percent}%
      </div>
    </div>
  );
}

export function CreateJobHeader({
  onBack,
  progress,
  stepStatus,
  isMachine,
  t,
}: {
  onBack: () => void;
  progress: number;
  stepStatus: boolean[];
  isMachine: boolean;
  t: TFunction;
}) {
  const steps = [
    { label: t("createJob.step.jobDetails"), target: "cj-step-1" },
    { label: t("createJob.step.location"), target: "cj-step-2" },
    { label: t(isMachine ? "createJob.maintenanceTemplate" : "createJob.step.category"), target: isMachine ? "cj-step-template" : "cj-step-category" },
    { label: t("createJob.step.additional"), target: "cj-step-3" },
    { label: t("createJob.step.photos"), target: "cj-step-4" },
  ];

  return (
    <header
      className="sticky top-0 z-30 rounded-xl border border-border bg-card px-4 pb-4 pt-3 text-foreground shadow-soft md:top-3 md:px-5 xl:px-6"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-3 md:gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
          aria-label={t("createJob.header.back")}
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-semibold leading-tight text-foreground md:text-xl">
            {t("createJob.header.title")}
          </h2>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {t("createJob.header.subtitle")}
          </p>
        </div>
        <ProgressRing percent={progress} />
      </div>
      <nav
        className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden"
        aria-label={t("createJob.header.sections")}
      >
        {steps.map((step, index) => {
          const done = stepStatus[index];
          return (
            <button
              key={step.target}
              type="button"
              onClick={() =>
                document
                  .getElementById(step.target)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={`flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3 py-2 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
                done
                  ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {done && <Check className="h-3.5 w-3.5 text-primary" />}
              {step.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="break-words text-base font-semibold leading-6 text-foreground">
          {title}
        </h2>
        <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
