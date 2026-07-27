"use client";

import { useState } from "react";
import { ArrowRight, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

export default function RegisterForm() {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const startSecureSignup = () => {
    setIsRedirecting(true);
    window.location.assign("/api/auth/login?screen_hint=signup");
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={startSecureSignup}
        disabled={isRedirecting}
        className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:pointer-events-none disabled:opacity-60"
      >
        {isRedirecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Opening secure registration…
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Continue securely
            <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
        <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-blue-50 text-blue-700">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="text-xs leading-5 text-slate-600">
          Registration and password security are handled by our secure identity
          service. Property access is granted separately by your HotelCare Pro
          administrator.
        </p>
      </div>
    </div>
  );
}
