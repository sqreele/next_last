"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, MailPlus, RefreshCw, RotateCw, UserRoundX } from "lucide-react";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";

type Tenant = { id: number; tenant_id: string; name: string };
type Property = { id: number; property_id: string; name: string; tenant: number };
type InvitationProperty = Pick<Property, "id" | "property_id" | "name">;
type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";
type Invitation = {
  id: number;
  tenant: number;
  tenant_name: string;
  email: string;
  role: string;
  properties: InvitationProperty[];
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  email_sent?: boolean;
};

const roles = ["owner", "admin", "manager", "supervisor", "technician", "viewer", "billing"] as const;
const tenantWideRoles = new Set(["owner", "admin", "manager"]);
const propertyRequiredRoles = new Set(["supervisor", "technician", "viewer"]);

function rows<T>(payload: T[] | { results?: T[] } | null): T[] {
  if (Array.isArray(payload)) return payload;
  return payload?.results || [];
}

function roleLabel(role: string) {
  return role.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function apiMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const details = payload as Record<string, unknown>;
  if (typeof details.detail === "string") return details.detail;
  for (const value of Object.values(details)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return fallback;
}

function statusVariant(status: InvitationStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "pending") return "default";
  if (status === "accepted") return "secondary";
  if (status === "revoked") return "destructive";
  return "outline";
}

export default function TenantUsersSettingsPage() {
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({ requireAuth: true });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("technician");
  const [propertyIds, setPropertyIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => String(tenant.id) === tenantId),
    [tenantId, tenants],
  );
  const tenantProperties = useMemo(
    () => properties.filter((property) => String(property.tenant) === tenantId),
    [properties, tenantId],
  );

  const loadWorkspace = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [tenantResponse, propertyResponse] = await Promise.all([
        fetch("/api/v1/tenants/", { credentials: "include", cache: "no-store" }),
        fetch("/api/v1/properties/", { credentials: "include", cache: "no-store" }),
      ]);
      const tenantPayload = await tenantResponse.json().catch(() => null);
      const propertyPayload = await propertyResponse.json().catch(() => null);
      if (!tenantResponse.ok) throw new Error(apiMessage(tenantPayload, "Unable to load tenants."));
      if (!propertyResponse.ok) throw new Error(apiMessage(propertyPayload, "Unable to load properties."));
      const tenantRows = rows<Tenant>(tenantPayload);
      setTenants(tenantRows);
      setProperties(rows<Property>(propertyPayload));
      setTenantId((current) => current || (tenantRows[0] ? String(tenantRows[0].id) : ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load user settings.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadInvitations = useCallback(async () => {
    if (!tenantId) {
      setInvitations([]);
      return;
    }
    setError(null);
    const response = await fetch(`/api/v1/tenant-invitations/?tenant=${encodeURIComponent(tenantId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setInvitations([]);
      setError(apiMessage(payload, "You do not have permission to manage invitations for this tenant."));
      return;
    }
    setInvitations(rows<Invitation>(payload));
  }, [tenantId]);

  useEffect(() => {
    if (isAuthenticated) void loadWorkspace();
  }, [isAuthenticated, loadWorkspace]);

  useEffect(() => {
    if (isAuthenticated && tenantId) void loadInvitations();
  }, [isAuthenticated, loadInvitations, tenantId]);

  useEffect(() => {
    if (tenantWideRoles.has(role)) setPropertyIds([]);
  }, [role]);

  async function createInvitation() {
    if (!tenantId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/tenant-invitations/", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: Number(tenantId),
          email,
          role,
          properties: propertyIds,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiMessage(payload, "Unable to create invitation."));
      setDialogOpen(false);
      setEmail("");
      setRole("technician");
      setPropertyIds([]);
      await loadInvitations();
      if (payload?.email_sent === false) {
        setError("The invitation was created, but email delivery failed. Use Resend after checking email configuration.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function invitationAction(invitation: Invitation, action: "resend" | "revoke") {
    setActionId(invitation.id);
    setError(null);
    try {
      const response = await fetch(`/api/v1/tenant-invitations/${invitation.id}/${action}/`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiMessage(payload, `Unable to ${action} invitation.`));
      await loadInvitations();
      if (action === "resend" && payload?.email_sent === false) {
        setError("The token was rotated, but email delivery failed. The previous invitation link is no longer valid.");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} invitation.`);
    } finally {
      setActionId(null);
    }
  }

  if (sessionLoading || loading) {
    return <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Loading user settings…</div>;
  }
  if (!isAuthenticated) return null;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <div className="pcms-page-header">
        <div>
          <p className="pcms-eyebrow">Settings</p>
          <h1>Users and invitations</h1>
          <p className="pcms-page-description">Invite pre-provisioned users and assign their tenant role and property scope.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!selectedTenant} className="min-h-11 w-full sm:w-auto">
              <MailPlus className="mr-2 h-4 w-4" /> Invite user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a user</DialogTitle>
              <DialogDescription>
                Access is granted only after the recipient signs in with the invited email and accepts.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map((value) => <SelectItem key={value} value={value}>{roleLabel(value)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!tenantWideRoles.has(role) ? (
                <div className="space-y-2">
                  <Label>Property access {propertyRequiredRoles.has(role) ? "(required)" : "(optional)"}</Label>
                  <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border p-3">
                    {tenantProperties.length ? tenantProperties.map((property) => {
                      const checked = propertyIds.includes(property.id);
                      return (
                        <label key={property.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => setPropertyIds((current) => next
                              ? [...current, property.id]
                              : current.filter((id) => id !== property.id))}
                          />
                          <span className="text-sm">{property.name}</span>
                        </label>
                      );
                    }) : <p className="text-sm text-muted-foreground">No properties are available in this tenant.</p>}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">This role has tenant-wide property access; explicit grants are not stored.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
              <Button
                onClick={() => void createInvitation()}
                disabled={!email.trim() || submitting || (propertyRequiredRoles.has(role) && propertyIds.length === 0)}
              >
                {submitting ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Tenant invitations</CardTitle>
            <CardDescription>Pending invitations expire automatically at the time shown below.</CardDescription>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="min-w-56"><SelectValue placeholder="Select tenant" /></SelectTrigger>
              <SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void loadInvitations()} aria-label="Refresh invitations">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {invitations.length ? (
            <Table mobileCards>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Properties</TableHead><TableHead>Status</TableHead><TableHead>Expires</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell mobileLabel="Email" className="font-medium">{invitation.email}</TableCell>
                  <TableCell mobileLabel="Role">{roleLabel(invitation.role)}</TableCell>
                  <TableCell mobileLabel="Properties">{invitation.properties.length ? invitation.properties.map((property) => property.name).join(", ") : "Tenant-wide / none"}</TableCell>
                  <TableCell mobileLabel="Status"><Badge variant={statusVariant(invitation.status)}>{roleLabel(invitation.status)}</Badge></TableCell>
                  <TableCell mobileLabel="Expires">{new Date(invitation.expires_at).toLocaleString()}</TableCell>
                  <TableCell mobileLabel="Actions" className="text-right">
                    {invitation.status === "pending" || invitation.status === "expired" ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" disabled={actionId === invitation.id} onClick={() => void invitationAction(invitation, "resend")}><RotateCw className="mr-1 h-3.5 w-3.5" /> Resend</Button>
                        <Button variant="outline" size="sm" disabled={actionId === invitation.id} onClick={() => void invitationAction(invitation, "revoke")}><UserRoundX className="mr-1 h-3.5 w-3.5" /> Revoke</Button>
                      </div>
                    ) : <span className="text-sm text-muted-foreground">No actions</span>}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">No invitations for this tenant.</div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
