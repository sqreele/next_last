"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Building2, CheckCircle2, Clock3, Loader2, LockKeyhole, XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";

type PreviewStatus = "pending" | "accepted" | "expired" | "revoked";
type Preview = {
  tenant_name: string;
  role: string;
  properties: { id: number; property_id: string; name: string }[];
  expires_at: string;
  status: PreviewStatus;
};

function InvitationLoading() {
  return <div className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label="Loading invitation" /></div>;
}

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({ requireAuth: false, showToast: false });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const returnPath = useMemo(() => `/invitations/accept?token=${encodeURIComponent(token)}`, [token]);

  const loadPreview = useCallback(async () => {
    if (!token) {
      setError("This invitation link is invalid.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const response = await fetch(`/api/v1/invitations/preview/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError("This invitation link is invalid or unavailable.");
      setPreview(null);
    } else {
      setPreview(payload as Preview);
      setError(null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/invitations/accept/", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = typeof payload?.detail === "string" ? payload.detail : "Unable to accept this invitation.";
        throw new Error(detail);
      }
      setAccepted(true);
      setPreview((current) => current ? { ...current, status: "accepted" } : current);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Unable to accept this invitation.");
    } finally {
      setAccepting(false);
    }
  }

  if (loading || sessionLoading) return <InvitationLoading />;

  const stateCopy: Record<Exclude<PreviewStatus, "pending">, { title: string; detail: string; icon: typeof AlertCircle }> = {
    accepted: { title: "Invitation already accepted", detail: "This invitation has already been used.", icon: CheckCircle2 },
    expired: { title: "Invitation expired", detail: "Ask a tenant administrator to resend the invitation.", icon: Clock3 },
    revoked: { title: "Invitation revoked", detail: "This invitation was withdrawn by a tenant administrator.", icon: XCircle },
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><Building2 className="h-5 w-5" /></div>
          <CardTitle>{preview ? `Join ${preview.tenant_name}` : "Invitation unavailable"}</CardTitle>
          <CardDescription>HotelCare Pro tenant invitation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}
          {accepted ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <div><h2 className="font-semibold">Access granted</h2><p className="mt-1 text-sm text-muted-foreground">Your canonical tenant membership and property grants are ready.</p></div>
              <Button onClick={() => router.push("/dashboard")} className="w-full">Continue to dashboard</Button>
            </div>
          ) : preview && preview.status !== "pending" ? (() => {
            const state = stateCopy[preview.status];
            const Icon = state.icon;
            return <div className="space-y-3 text-center"><Icon className="mx-auto h-12 w-12 text-muted-foreground" /><h2 className="font-semibold">{state.title}</h2><p className="text-sm text-muted-foreground">{state.detail}</p><Button asChild variant="outline" className="w-full"><Link href="/">Return home</Link></Button></div>;
          })() : preview ? (
            <>
              <div className="rounded-xl border bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Role</span><Badge>{preview.role.replace(/\b\w/g, (letter) => letter.toUpperCase())}</Badge></div>
                <div className="mt-3"><p className="text-sm text-muted-foreground">Property access</p><p className="mt-1 text-sm font-medium">{preview.properties.length ? preview.properties.map((property) => property.name).join(", ") : "Tenant-wide or no explicit grants"}</p></div>
                <div className="mt-3"><p className="text-sm text-muted-foreground">Expires</p><p className="mt-1 text-sm font-medium">{new Date(preview.expires_at).toLocaleString()}</p></div>
              </div>
              {isAuthenticated ? (
                <Button onClick={() => void accept()} disabled={accepting} className="h-12 w-full">{accepting ? "Accepting…" : "Accept invitation"}</Button>
              ) : (
                <div className="space-y-3">
                  <Alert><LockKeyhole className="h-4 w-4" /><AlertDescription>Sign in with the email address that received this invitation.</AlertDescription></Alert>
                  <Button asChild className="h-12 w-full"><Link href={`/auth/login?redirect=${encodeURIComponent(returnPath)}`}>Sign in to accept</Link></Button>
                </div>
              )}
            </>
          ) : <Button asChild variant="outline" className="w-full"><Link href="/">Return home</Link></Button>}
        </CardContent>
      </Card>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return <Suspense fallback={<InvitationLoading />}><AcceptInvitationContent /></Suspense>;
}
