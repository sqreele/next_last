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
  className?: string;
};

export function FeedbackState({
  variant = "empty",
  title,
  description,
  action,
  className,
}: FeedbackStateProps) {
  const Icon = stateIcons[variant];
  const assertive = variant === "error" || variant === "offline";

  return (
    <section
      className={cn(
        "flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center",
        className,
      )}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

