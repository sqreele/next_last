"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ProfileImage } from "@/app/components/profile/ProfileImage";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";
import type { CurrentUserProfile, ProfileMembership } from "@/app/lib/profile";

function labelRole(role: string) {
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MembershipCard({ membership }: { membership: ProfileMembership }) {
  return (
    <section
      className="rounded-xl border bg-card p-4"
      aria-label={`${membership.tenant_name} membership`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">
            {membership.tenant_name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {membership.access_scope === "tenant_wide"
              ? "Access to every property in this tenant"
              : "Access to explicitly granted properties"}
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {labelRole(membership.role)}
        </Badge>
      </div>
      <div
        className="mt-4 flex flex-wrap gap-2"
        aria-label="Accessible properties"
      >
        {membership.properties.length ? (
          membership.properties.map((property) => (
            <Badge
              key={property.property_id}
              variant="outline"
              className="max-w-full whitespace-normal"
            >
              {property.name}
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No property grants in this tenant.
          </p>
        )}
      </div>
    </section>
  );
}

function ProfileLoading() {
  return (
    <div
      className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6"
      role="status"
      aria-live="polite"
    >
      <Card>
        <CardContent className="space-y-5 py-10">
          <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-muted" />
          <div className="mx-auto h-5 w-52 animate-pulse rounded bg-muted" />
          <div className="mx-auto h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
          <span className="sr-only">Loading profile</span>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({
    requireAuth: true,
  });
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    setProfileLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/me", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(payload?.detail || "Unable to load your profile.");
      setProfile(payload as CurrentUserProfile);
    } catch (loadError) {
      setProfile(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your profile.",
      );
    } finally {
      setProfileLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) void loadProfile();
    else if (!sessionLoading) setProfileLoading(false);
  }, [isAuthenticated, loadProfile, sessionLoading]);

  if (sessionLoading || (isAuthenticated && profileLoading))
    return <ProfileLoading />;
  if (!isAuthenticated) return null;

  if (error || !profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
        <Card>
          <CardContent
            className="flex flex-col items-center gap-4 py-10 text-center"
            role="alert"
          >
            <AlertCircle
              className="h-12 w-12 text-destructive"
              aria-hidden="true"
            />
            <div>
              <h1 className="text-xl font-semibold">Profile unavailable</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {error || "No profile data was returned."}
              </p>
            </div>
            <Button onClick={() => void loadProfile()} className="min-h-11">
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username || "User";
  return (
    <main className="w-full px-3 pb-6 pt-2 sm:px-4 md:px-6">
      <div className="pcms-page-header mx-auto mb-4 max-w-5xl">
        <div className="min-w-0">
          <p className="pcms-eyebrow">Account workspace</p>
          <h1>Profile</h1>
          <p className="pcms-page-description">
            Review your personal details and organization access.
          </p>
        </div>
        <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
          <Link href="/dashboard/profile/edit/me">
            <Pencil className="mr-2 h-4 w-4" /> Edit personal details
          </Link>
        </Button>
      </div>

      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)] lg:gap-6">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <ProfileImage
                src={profile.profile_image}
                alt={`${displayName}'s profile image`}
                size="md"
              />
              <div className="min-w-0">
                <CardTitle className="break-words text-2xl">
                  {displayName}
                </CardTitle>
                <CardDescription className="mt-1 break-all">
                  {profile.email || "No account email"}
                </CardDescription>
                {profile.positions ? (
                  <Badge
                    className="mt-2 max-w-full whitespace-normal"
                    variant="secondary"
                  >
                    {profile.positions}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
            <InfoRow
              icon={UserRound}
              label="First name"
              value={profile.first_name || "Not provided"}
            />
            <InfoRow
              icon={UserRound}
              label="Last name"
              value={profile.last_name || "Not provided"}
            />
            <InfoRow
              icon={Mail}
              label="Account email"
              value={profile.email || "Not provided"}
              breakAll
            />
            <InfoRow
              icon={ShieldCheck}
              label="Job title"
              value={profile.positions || "Not provided"}
            />
            <InfoRow
              icon={CalendarDays}
              label="Member since"
              value={new Date(profile.created_at).toLocaleDateString()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Building2 className="h-5 w-5" aria-hidden="true" /> Organization
              access
            </CardTitle>
            <CardDescription>
              Tenant, role, and property access are managed by an administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            {profile.is_platform_superuser ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Platform superuser break-glass access is active.
              </div>
            ) : profile.memberships.length ? (
              profile.memberships.map((membership) => (
                <MembershipCard
                  key={membership.tenant_id}
                  membership={membership}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No active tenant membership. Contact an administrator to request
                access.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  breakAll = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="flex min-w-0 gap-3 rounded-xl bg-muted/60 p-3">
      <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-card">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p
          className={`text-sm text-muted-foreground ${breakAll ? "break-all" : "break-words"}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
