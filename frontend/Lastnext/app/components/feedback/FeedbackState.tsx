import type { LucideIcon } from "lucide-react";
import {
  CircleOff,
  CloudOff,
  FileQuestion,
  SearchX,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/app/lib/utils/cn";
import { RefreshPageButton } from "@/app/components/feedback/RefreshPageButton";

const stateIcons = {
  empty: CircleOff,
  "no-results": SearchX,
  error: TriangleAlert,
  offline: CloudOff,
  unauthorized: ShieldX,
  unavailable: FileQuestion,
} satisfies Record<string, LucideIcon>;

type FeedbackStateProps = {
  variant?: keyof typeof stateIcons;
  title: string;
  description?: string;
  action?: ReactNode;
  showRefresh?: boolean;
  className?: string;
};

export function FeedbackState({
  variant = "empty",
  title,
  description,
  action,
  showRefresh,
  className,
}: FeedbackStateProps) {
  const Icon = stateIcons[variant];
  const assertive = variant === "error" || variant === "offline";
  const shouldShowRefresh =
    showRefresh ??
    (variant === "empty" ||
      variant === "error" ||
      variant === "offline" ||
      variant === "unavailable");

  return (
    <section
      className={cn(
        "flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-5 py-10 text-center shadow-soft",
        className,
      )}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action || shouldShowRefresh ? (
        <div className="mt-5 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">
          {action}
          {shouldShowRefresh ? <RefreshPageButton /> : null}
        </div>
      ) : null}
    </section>
  );
}
