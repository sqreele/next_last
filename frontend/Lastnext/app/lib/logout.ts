"use client";
import { ROUTES } from "@/app/lib/config";
import { usePropertyStore } from "@/app/lib/stores/usePropertyStore";
import { useAuthStore } from "@/app/lib/stores/useAuthStore";
import { usePreventiveMaintenanceStore } from "@/app/lib/stores/usePreventiveMaintenanceStore";
import { useFilterStore } from "@/app/lib/stores/useFilterStore";

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
  const callbackUrl = options?.callbackUrl || ROUTES.signIn || "/auth/signin";
  const redirect = options?.redirect ?? true;

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

