"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { useOfflineQueue } from "@/app/lib/hooks/useOfflineQueue";
import { useT } from "@/app/lib/i18n/LocaleProvider";

/**
 * Slim sticky banner that surfaces network state plus any work queued
 * locally while offline so technicians on flaky hotel Wi-Fi know whether
 * their next mutation will round-trip — and whether earlier mutations have
 * caught up. Silent on the happy path.
 */
export function NetworkStatusBanner() {
  const t = useT();
  const [online, setOnline] = useState(true);
  const [recentlyRecovered, setRecentlyRecovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { queue, count, drain, isDraining } = useOfflineQueue();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      setRecentlyRecovered(true);
      window.setTimeout(() => setRecentlyRecovered(false), 4000);
    };
    const handleOffline = () => {
      setOnline(false);
      setRecentlyRecovered(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const hasQueuedWork = count > 0;
  if (online && !recentlyRecovered && !hasQueuedWork) return null;

  // Compose status + tone. Queued items take priority over "back online"
  // because the user cares more about whether their work has actually
  // landed than about transient connection state.
  let tone: "offline" | "online" | "syncing" = "online";
  if (!online) tone = "offline";
  else if (hasQueuedWork) tone = "syncing";

  const toneClass =
    tone === "offline"
      ? "bg-rose-600"
      : tone === "syncing"
        ? "bg-amber-500"
        : "bg-emerald-600";

  const Icon =
    tone === "offline" ? WifiOff : tone === "syncing" ? Loader2 : Wifi;

  const visibleQueue = queue.slice(0, 4);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-[70] text-xs font-semibold text-white shadow-soft",
        toneClass,
      )}
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => hasQueuedWork && setExpanded((value) => !value)}
          className="flex min-w-0 items-center gap-2 text-left"
          disabled={!hasQueuedWork}
          aria-expanded={expanded}
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5 flex-none",
              tone === "syncing" && isDraining && "animate-spin",
            )}
          />
          <span className="truncate">
            {tone === "offline" && (
              <>
                {t("network.offline")}
                {hasQueuedWork && ` (${count})`}
              </>
            )}
            {tone === "syncing" && (
              <>
                {isDraining
                  ? `${t("network.syncing")} (${count})`
                  : `${count} · ${t("network.queuedSync")}`}
              </>
            )}
            {tone === "online" && !hasQueuedWork && t("network.online")}
          </span>
          {hasQueuedWork && (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 flex-none transition-transform",
                expanded && "rotate-180",
              )}
            />
          )}
        </button>
        {tone === "syncing" && !isDraining && (
          <button
            type="button"
            onClick={() => drain().catch(() => undefined)}
            className="rounded-full bg-card/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider hover:bg-card/30"
          >
            {t("network.retryNow")}
          </button>
        )}
      </div>

      {expanded && hasQueuedWork && (
        <div className="border-t border-white/20 bg-black/10 px-3 py-2">
          <ol className="space-y-1">
            {visibleQueue.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md bg-card/10 px-2 py-1"
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="flex-none text-[10px] uppercase tracking-wide text-white/80">
                  {item.kind === "job-comment-create" ? "Comment" : "Status"}
                </span>
              </li>
            ))}
          </ol>
          {queue.length > visibleQueue.length && (
            <p className="mt-1 px-2 text-[11px] text-white/85">
              +{queue.length - visibleQueue.length} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
