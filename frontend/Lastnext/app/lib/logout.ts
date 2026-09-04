"use client";
import { ROUTES } from "@/app/lib/config";
import { usePropertyStore } from "@/app/lib/stores/usePropertyStore";
import { useAuthStore } from "@/app/lib/stores/useAuthStore";
import { usePreventiveMaintenanceStore } from "@/app/lib/stores/usePreventiveMaintenanceStore";
import { useFilterStore } from "@/app/lib/stores/useFilterStore";
import { clearQueue } from "@/app/lib/offline-queue";

// Lightweight runtime-safe accessors to avoid SSR usage
function safeClearLocalStorageKeys(keys: string[]) {
  if (typeof window === "undefined") return;
  try {
    for (const key of keys) {
      window.localStorage.removeItem(key);
      try {
        window.sessionStorage.removeItem(key);
      } catch {}
    }
  } catch {}
}

function clearZustandStores() {
  try {
    // Stores created via hooks need to be called within client runtime
    // We defensively clear what we can without throwing if not mounted
    try { usePropertyStore.getState().clear(); } catch {}
    try { useAuthStore.getState().clearAuth(); } catch {}
    try { usePreventiveMaintenanceStore.getState().clear(); } catch {}
    try { useFilterStore.persist?.clearStorage?.(); } catch {}
  } catch {}
}

export async function appSignOut(options?: { callbackUrl?: string; redirect?: boolean }) {
  const callbackUrl = options?.callbackUrl || ROUTES.signIn || "/auth/login";
  const redirect = options?.redirect ?? true;

  // Clear authenticated mutations before changing identity. If durable queue
  // clearing fails, remain in the current session rather than risking User A
  // writes replaying under User B after a logout/login transition.
  try {
    await clearQueue();
  } catch {
    console.error("offline_queue_clear_failed_before_logout");
    throw new Error("Unable to safely clear pending offline changes. Please retry logout.");
  }

  // Clear any custom tokens and persisted UI state
  safeClearLocalStorageKeys([
    "accessToken",
    "refreshToken",
    "selectedPropertyId",
    "auth-storage",
    "filter-storage",
    "pm-storage",
  ]);

  clearZustandStores();

  try {
    // Redirect to Auth0 logout which clears its cookies
    const url = callbackUrl ? `/api/auth/logout?returnTo=${encodeURIComponent(callbackUrl)}` : '/api/auth/logout';
    if (redirect !== false) {
      window.location.assign(url);
      return;
    }
  } catch (error) {
    // Swallow errors but attempt client-side redirect fallback below
    // eslint-disable-next-line no-console
    console.error("[appSignOut] signOut threw error, continuing with fallback redirect:", error);
  } finally {
    // Ensure navigation away from protected pages if redirect is false or signOut doesn't navigate
    if (typeof window !== "undefined") {
      // Force navigation if not already redirected
      if (redirect === false) {
        window.location.assign(callbackUrl);
      }
    }
  }
}
