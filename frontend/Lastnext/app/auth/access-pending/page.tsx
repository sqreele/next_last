"use client";

import { Building2, Clock3, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { appSignOut } from "@/app/lib/logout";

export default function AccessPendingPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-lg shadow-slate-900/5 sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <Clock3 className="h-7 w-7" aria-hidden="true" />
        </span>

        <p className="mt-5 text-sm font-semibold text-blue-700">
          Account created
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Waiting for property access
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your account is secure and ready. Ask your StayMaint administrator
          to assign the properties you are authorized to manage.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Access is administrator controlled
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                You will be able to open the dashboard after at least one
                property has been assigned to your account.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => window.location.assign("/api/auth/login")}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Check again
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full"
            onClick={() => void appSignOut({ callbackUrl: "/auth/login" })}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Building2 className="h-3.5 w-3.5" />
          StayMaint
        </div>
      </section>
    </main>
  );
}
