"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Mail,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";
import type {
  CurrentUserProfile,
  ProfileFieldErrors,
  ProfilePatch,
} from "@/app/lib/profile";
import {
  buildProfilePatch,
  hasProfileChanges,
  profileErrorMessage,
  profileFieldErrors,
} from "@/app/lib/profile-request.mjs";

const EMPTY_FORM: ProfilePatch = {
  first_name: "",
  last_name: "",
  positions: "",
};

export default function EditProfilePage() {
  const params = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({
    requireAuth: true,
  });
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [initial, setInitial] = useState<ProfilePatch>(EMPTY_FORM);
  const [form, setForm] = useState<ProfilePatch>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [saved, setSaved] = useState(false);
  const submitLock = useRef(false);
  const isOwnRoute = params.id === "me";
  const dirty = hasProfileChanges(initial, form);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated || !isOwnRoute) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/profile/me", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(payload?.detail || "Unable to load your profile.");
      const nextProfile = payload as CurrentUserProfile;
      const nextForm = {
        first_name: nextProfile.first_name || "",
        last_name: nextProfile.last_name || "",
        positions: nextProfile.positions || "",
      };
      setProfile(nextProfile);
      setInitial(nextForm);
      setForm(nextForm);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load your profile.",
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isOwnRoute]);

  useEffect(() => {
    if (isAuthenticated && isOwnRoute) void loadProfile();
    else if (!sessionLoading) setLoading(false);
  }, [isAuthenticated, isOwnRoute, loadProfile, sessionLoading]);

  useEffect(() => {
    const protectDirtyForm = (event: BeforeUnloadEvent) => {
      if (!dirty || saving) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDirtyForm);
    return () => window.removeEventListener("beforeunload", protectDirtyForm);
  }, [dirty, saving]);

  const updateField = (field: keyof ProfilePatch, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || saving || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/profile/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProfilePatch(initial, form)),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFieldErrors(profileFieldErrors(payload));
        throw new Error(profileErrorMessage(payload));
      }
      const authoritative = payload as CurrentUserProfile;
      const nextForm = {
        first_name: authoritative.first_name || "",
        last_name: authoritative.last_name || "",
        positions: authoritative.positions || "",
      };
      setProfile(authoritative);
      setInitial(nextForm);
      setForm(nextForm);
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save your profile.",
      );
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  if (!isOwnRoute) {
    return (
      <StateCard
        title="Access denied"
        message="This page only edits the authenticated user's profile."
      />
    );
  }
  if (sessionLoading || (isAuthenticated && loading))
    return <StateCard title="Loading profile" message="Please wait…" loading />;
  if (!isAuthenticated) return null;
  if (loadError || !profile) {
    return (
      <StateCard
        title="Profile unavailable"
        message={loadError || "No profile data was returned."}
        retry={() => void loadProfile()}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 pb-32 sm:px-6 sm:pb-6">
      <Button asChild variant="ghost" className="min-h-11">
        <Link href="/dashboard/profile">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile
        </Link>
      </Button>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-2xl">Edit personal details</CardTitle>
          <CardDescription>
            Account identity and organization access are read-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                id="first_name"
                value={form.first_name}
                error={fieldErrors.first_name}
                disabled={saving}
                onChange={(value) => updateField("first_name", value)}
              />
              <Field
                label="Last name"
                id="last_name"
                value={form.last_name}
                error={fieldErrors.last_name}
                disabled={saving}
                onChange={(value) => updateField("last_name", value)}
              />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="positions">Job title</Label>
                <Input
                  id="positions"
                  value={form.positions || ""}
                  onChange={(event) =>
                    updateField("positions", event.target.value)
                  }
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.positions)}
                  aria-describedby={
                    fieldErrors.positions ? "positions-error" : undefined
                  }
                />
                {fieldErrors.positions ? (
                  <p id="positions-error" className="text-sm text-destructive">
                    {fieldErrors.positions}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A descriptive title only; this does not change your
                    application role.
                  </p>
                )}
              </div>
            </div>

            <section
              className="space-y-3 rounded-xl border bg-muted/40 p-4"
              aria-labelledby="account-fields-heading"
            >
              <h2 id="account-fields-heading" className="font-semibold">
                Account and organization
              </h2>
              <ReadOnlyRow
                icon={Mail}
                label="Account email"
                value={profile.email || "Not provided"}
              />
              <ReadOnlyRow
                icon={ShieldCheck}
                label="Roles"
                value={
                  profile.memberships.length
                    ? profile.memberships
                        .map((item) => `${item.tenant_name}: ${item.role}`)
                        .join(" · ")
                    : "No active membership"
                }
              />
              <ReadOnlyRow
                icon={Building2}
                label="Accessible properties"
                value={
                  profile.properties.length
                    ? profile.properties.map((item) => item.name).join(", ")
                    : "None"
                }
              />
            </section>

            <div aria-live="polite" className="space-y-3">
              {saved ? (
                <Alert>
                  <AlertDescription>
                    Profile saved. The values shown are confirmed by the server.
                  </AlertDescription>
                </Alert>
              ) : null}
              {saveError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 grid gap-2 border-t bg-background/95 p-3 backdrop-blur-sm sm:static sm:flex sm:border-0 sm:bg-transparent sm:p-0">
              <Button
                type="submit"
                disabled={!dirty || saving}
                className="min-h-11 sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />{" "}
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                asChild
                type="button"
                variant="outline"
                className="min-h-11 sm:w-auto"
              >
                <Link href="/dashboard/profile">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Field({
  label,
  id,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  id: keyof ProfilePatch;
  value: string | null;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ReadOnlyRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon
        className="mt-0.5 h-5 w-5 flex-none text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-words text-sm text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function StateCard({
  title,
  message,
  loading = false,
  retry,
}: {
  title: string;
  message: string;
  loading?: boolean;
  retry?: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-3 py-6 sm:px-6">
      <Card>
        <CardContent
          className="flex flex-col items-center gap-4 py-10 text-center"
          role={loading ? "status" : "alert"}
        >
          {loading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          ) : (
            <AlertCircle className="h-10 w-10 text-destructive" />
          )}
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>
          {retry ? (
            <Button onClick={retry} className="min-h-11">
              Retry
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
