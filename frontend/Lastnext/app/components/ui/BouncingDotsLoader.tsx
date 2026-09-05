import { cn } from "@/app/lib/utils/cn";

export type BouncingDotsLoaderProps = {
  size?: "sm" | "md" | "lg";
  label?: string;
  fullScreen?: boolean;
  className?: string;
};

const sizes: Record<NonNullable<BouncingDotsLoaderProps["size"]>, string> = {
  sm: "gap-1 [&_[data-loader-dot]]:h-1.5 [&_[data-loader-dot]]:w-1.5",
  md: "gap-1.5 [&_[data-loader-dot]]:h-2.5 [&_[data-loader-dot]]:w-2.5",
  lg: "gap-2 [&_[data-loader-dot]]:h-3.5 [&_[data-loader-dot]]:w-3.5",
};

export function BouncingDotsLoader({
  size = "md",
  label,
  fullScreen = false,
  className,
}: BouncingDotsLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center justify-center text-current",
        fullScreen && "min-h-screen w-full",
        className,
      )}
    >
      <span className={cn("inline-flex items-center", sizes[size])} aria-hidden="true">
        <span
          data-loader-dot
          className="rounded-full bg-current motion-safe:animate-bounce motion-reduce:animate-none motion-reduce:opacity-60"
        />
        <span
          data-loader-dot
          className="rounded-full bg-current motion-safe:animate-bounce motion-safe:[animation-delay:150ms] motion-reduce:animate-none motion-reduce:opacity-75"
        />
        <span
          data-loader-dot
          className="rounded-full bg-current motion-safe:animate-bounce motion-safe:[animation-delay:300ms] motion-reduce:animate-none"
        />
      </span>
      <span className={label ? "ml-2" : "sr-only"}>{label ?? "Loading"}</span>
    </div>
  );
}
