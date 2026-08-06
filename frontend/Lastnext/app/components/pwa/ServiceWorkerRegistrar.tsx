"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useT } from "@/app/lib/i18n/LocaleProvider";

/**
 * Registers /sw.js in production. Skipped in dev so HMR is not poisoned by
 * service-worker caching, and skipped entirely when the browser lacks SW
 * support (older iOS Safari in private browsing, embedded webviews, etc).
 *
 * Also surfaces an "Update available" toast when a newer SW finishes
 * downloading so the user can apply it without manually hard-reloading.
 */
export function ServiceWorkerRegistrar() {
  const t = useT();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  const watchForWaiting = useCallback(
    (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // Only flag an update when a controller is already in place — the
          // *first* SW install (no current controller) is not an "update".
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(installing);
          }
        });
      });
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          watchForWaiting(registration);
          // Poll for updates every 30 minutes in case the user keeps a tab
          // open all day — the browser only auto-checks on navigation.
          setInterval(
            () => registration.update().catch(() => undefined),
            30 * 60 * 1000,
          );
        })
        .catch((error) => {
          console.warn(
            "HotelCare Pro service worker registration failed:",
            error,
          );
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    // The new SW becomes the controller after skipWaiting → reload so the
    // page picks up the new bundle, not stale chunks.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, [watchForWaiting]);

  if (!waitingWorker || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-24 z-[75] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-blue-200 bg-card p-3 shadow-card sm:bottom-6"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-blue-600 text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">
          {t("pwa.updateTitle")}
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          {t("pwa.updateBody")}
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}
        className="bg-blue-600 text-white hover:bg-blue-700"
      >
        {t("pwa.updateButton")}
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update prompt"
        className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
