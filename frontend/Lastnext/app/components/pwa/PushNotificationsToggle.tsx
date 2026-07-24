"use client";

import React, { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/session.client";
import { fetchWithToken } from "@/app/lib/data.server";
import { cn } from "@/app/lib/utils/cn";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://hotelcarepro.com");

type PushState =
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "unsubscribed"
  | "subscribing"
  | "subscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window !== "undefined" ? window.atob(base64) : "";
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof window !== "undefined"
    ? window
        .btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    : "";
}

export function PushNotificationsToggle({ className }: { className?: string }) {
  const { data: session } = useSession();
  const [state, setState] = useState<PushState>("unsubscribed");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accessToken = session?.user?.accessToken;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
    }
    // Initial check: do we already have a subscription?
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      registration.pushManager.getSubscription().then((existing) => {
        if (existing) setState("subscribed");
      });
    });
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    fetchWithToken<{ public_key: string; configured: boolean }>(
      `${API_BASE_URL}/api/v1/push/public-key/`,
      accessToken,
    )
      .then((res) => {
        if (!res.configured || !res.public_key) {
          setState((s) => (s === "subscribed" ? s : "unconfigured"));
          return;
        }
        setPublicKey(res.public_key);
      })
      .catch(() => undefined);
  }, [accessToken]);

  if (state === "unsupported") return null;

  const subscribe = async () => {
    if (!accessToken || !publicKey) return;
    setBusy(true);
    setError(null);
    setState("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const subscriptionPayload = subscription.toJSON();
      await fetchWithToken(
        `${API_BASE_URL}/api/v1/push/subscribe/`,
        accessToken,
        "POST",
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh:
              subscriptionPayload.keys?.p256dh ||
              arrayBufferToBase64(subscription.getKey("p256dh")),
            auth:
              subscriptionPayload.keys?.auth ||
              arrayBufferToBase64(subscription.getKey("auth")),
          },
        },
      );
      setState("subscribed");
    } catch (err: any) {
      console.warn("Push subscribe failed:", err);
      setError(err?.message || "Could not enable push notifications.");
      setState("unsubscribed");
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetchWithToken(
          `${API_BASE_URL}/api/v1/push/unsubscribe/`,
          accessToken,
          "POST",
          { endpoint: subscription.endpoint },
        ).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("unsubscribed");
    } catch (err: any) {
      setError(err?.message || "Could not disable push notifications.");
    } finally {
      setBusy(false);
    }
  };

  let label = "Enable push";
  let Icon: React.ComponentType<{ className?: string }> = Bell;
  let onClick = subscribe;
  let disabled = busy;
  let variant: "default" | "outline" = "outline";

  if (state === "subscribed") {
    label = "Disable push";
    Icon = BellOff;
    onClick = unsubscribe;
    variant = "outline";
  } else if (state === "subscribing" || busy) {
    label = "Working...";
    Icon = Loader2;
    disabled = true;
  } else if (state === "denied") {
    label = "Blocked in browser";
    Icon = BellOff;
    disabled = true;
  } else if (state === "unconfigured") {
    label = "Push not configured";
    Icon = BellOff;
    disabled = true;
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Button
        type="button"
        variant={variant}
        onClick={onClick}
        disabled={disabled || (!publicKey && state !== "subscribed")}
        className="h-10"
      >
        <Icon className={cn("mr-2 h-4 w-4", busy && "animate-spin")} />
        {label}
      </Button>
      {state === "denied" && (
        <p className="text-xs font-semibold text-rose-700">
          Browser permission denied. Enable from the site settings to receive
          push notifications.
        </p>
      )}
      {state === "unconfigured" && (
        <p className="text-xs font-semibold text-muted-foreground">
          The server hasn't configured VAPID keys yet.
        </p>
      )}
      {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
}
