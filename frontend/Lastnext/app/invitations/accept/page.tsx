"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, CheckCircle2, Clock3, Loader2, LockKeyhole, XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";
import { captureInvitationToken, clearInvitationToken } from "@/app/lib/invitation-token.mjs";

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
  const router = useRouter();
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({ requireAuth: false, showToast: false });
  const [token, setToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [terminalFailure, setTerminalFailure] = useState(false);

  useEffect(() => {
    setToken(captureInvitationToken(window.location, window.history, window.sessionStorage));
    setTokenReady(true);
  }, []);

  const discardToken = useCallback(() => {
    clearInvitationToken(window.sessionStorage);
  }, []);

  const loadPreview = useCallback(async () => {
    if (!token) {
      setError("This invitation link is invalid.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/invitations/preview", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404 || response.status === 410) discardToken();
        setError("This invitation link is invalid or unavailable.");
        setPreview(null);
      } else {
        const nextPreview = payload as Preview;
        setPreview(nextPreview);
        if (nextPreview.status !== "pending") discardToken();
        setError(null);
      }
    } catch {
      setError("The invitation service is temporarily unavailable.");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [discardToken, token]);

  useEffect(() => {
    if (tokenReady) void loadPreview();
  }, [loadPreview, tokenReady]);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if ([404, 409, 410].includes(response.status)) {
          discardToken();
          setTerminalFailure(true);
        }
        const detail = payload?.code === "invitation_email_mismatch"
          ? "Email does not match this invitation. Please sign in with the email address that received the invitation."
          : typeof payload?.detail === "string" ? payload.detail : "Unable to accept this invitation.";
        throw new Error(detail);
      }
      discardToken();
      setAccepted(true);
      setPreview((current) => current ? { ...current, status: "accepted" } : current);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Unable to accept this invitation.");
    } finally {
      setAccepting(false);
    }
  }

  if (!tokenReady || loading || sessionLoading) return <InvitationLoading />;

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
          <CardDescription>StayMaint tenant invitation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}
          {accepted ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <div><h2 className="font-semibold">Access granted</h2><p className="mt-1 text-sm text-muted-foreground">Your canonical tenant membership and property grants are ready.</p></div>
              <Button onClick={() => router.push("/dashboard")} className="w-full">Continue to dashboard</Button>
            </div>
          ) : terminalFailure ? (
            <div className="space-y-3 text-center">
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <h2 className="font-semibold">Invitation cannot be accepted</h2>
              <p className="text-sm text-muted-foreground">Ask a tenant administrator to review your membership or send a new invitation.</p>
              <Button asChild variant="outline" className="w-full"><Link href="/">Return home</Link></Button>
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
                  <Button asChild className="h-12 w-full"><Link href="/auth/login?redirect=%2Finvitations%2Faccept">Sign in to accept</Link></Button>
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
  return <AcceptInvitationContent />;
}
