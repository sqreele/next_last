"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";
import {
  Building,
  User2,
  Mail,
  Calendar,
  Shield,
  Pencil,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { fixImageUrl } from "@/app/lib/utils/image-utils";
import { getDisplayName } from "@/app/lib/utils/display-name";
import Image from "next/image";

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, isLoading } = useSessionGuard({
    requireAuth: true,
  });
  const [userProperties, setUserProperties] = useState<any[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setLoadingProperties);

  // Process profile image URL
  const profileImageUrl = user?.profile_image
    ? fixImageUrl(user.profile_image)
    : null;
  const displayName = getDisplayName(user, "User");

  // Fetch user properties when component mounts
  useEffect(() => {
    if (isAuthenticated && user?.accessToken) {
      fetchUserProperties();
    }
  }, [isAuthenticated, user?.accessToken]);

  const fetchUserProperties = async () => {
    try {
      recordLoaderShown();
      setLoadingProperties(true);

      // Fetch properties from the API
      const response = await fetch("/api/properties/", {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Properties API error response:", errorText);
        throw new Error(
          `Failed to fetch properties: ${response.status} ${response.statusText}`,
        );
      }

      const properties = await response.json();

      if (Array.isArray(properties)) {
        setUserProperties(properties);
        setPropertiesError(null);
      } else {
        console.warn("⚠️ Properties response is not an array:", properties);
        setUserProperties([]);
        setPropertiesError("Invalid properties data format");
      }
    } catch (error) {
      console.error("❌ Error fetching properties:", error);
      setPropertiesError(
        error instanceof Error ? error.message : "Failed to fetch properties",
      );

      // Try to use properties from user session as fallback
      if (user?.properties && Array.isArray(user.properties)) {
        setUserProperties(user.properties);
      } else {
        setUserProperties([]);
      }
    } finally {
      clearLoadingAfterMinTime();
    }
  };

  // Helper function to get user initials
  const getUserInitials = (name: string) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1) return names[0][0];
    return `${names[0][0]}${names[1][0]}`;
  };

  // Show loading while checking session
  if (isLoading) {
    return (
      <div className="w-full px-3 py-4 sm:px-4 md:px-5">
        <div className="pcms-section-card py-12 text-center">
          <div className="space-y-4">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[var(--pcms-primary)]"></div>
            <p className="text-sm text-[var(--pcms-text-muted)]">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  if (!user) {
    return (
      <div className="w-full px-3 py-4 sm:px-4 md:px-5">
        <div className="mx-auto w-full max-w-4xl">
          <Card className="mx-auto w-full">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
                <h2 className="text-xl font-semibold text-foreground">
                  Profile Not Found
                </h2>
                <p className="text-muted-foreground">
                  Unable to load user profile information.
                </p>
                <Button onClick={() => router.push("/dashboard")}>
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-3 pb-4 pt-2 sm:px-4 md:px-5">
      <div className="pcms-page-header mb-4">
        <div className="min-w-0">
          <p className="pcms-eyebrow">Account workspace</p>
          <h1>Profile</h1>
          <p className="pcms-page-description">
            Manage your account details, properties, and access context.
          </p>
        </div>
      </div>

      <div className="w-full max-w-none lg:mx-auto lg:max-w-7xl desktop:max-w-[94rem]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Profile Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="min-w-0">
                  <CardTitle className="text-xl">
                    Personal Information
                  </CardTitle>
                  <CardDescription>
                    Your account details and preferences
                  </CardDescription>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full sm:w-auto"
                >
                  <Link href={`/dashboard/profile/edit/${user.id}`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Profile
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0 sm:space-y-6 sm:p-6 sm:pt-0">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  {profileImageUrl ? (
                    <div className="relative h-16 w-16 flex-none overflow-hidden rounded-full border-2 border-blue-200 sm:h-20 sm:w-20">
                      <Image
                        src={profileImageUrl}
                        alt={`${displayName}'s profile`}
                        fill
                        className="object-cover"
                        quality={75}
                        unoptimized={profileImageUrl.startsWith("http")}
                        onError={(e) => {
                          // If image fails to load, hide it and show fallback
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden",
                          );
                        }}
                      />
                      <div className="hidden h-16 w-16 items-center justify-center rounded-full border-2 border-blue-200 bg-blue-100 sm:h-20 sm:w-20">
                        <span className="text-xl font-bold text-blue-600 sm:text-2xl">
                          {getUserInitials(displayName)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full border-2 border-blue-200 bg-blue-100 sm:h-20 sm:w-20">
                      <span className="text-xl font-bold text-blue-600 sm:text-2xl">
                        {getUserInitials(displayName)}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold">{displayName}</h3>
                    <Badge variant="secondary" className="mt-1 max-w-full truncate">
                      {user.positions || "User"}
                    </Badge>
                  </div>
                </div>

                {/* Profile Details */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/60 p-3">
                      <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-card">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Email
                        </p>
                        <p className="break-all text-sm text-muted-foreground">
                          {user.email || "Not provided"}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/60 p-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-card">
                        <Shield className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Position
                        </p>
                        <p className="break-words text-sm text-muted-foreground">
                          {user.positions || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/60 p-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-card">
                        <Calendar className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Member Since
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {user.created_at
                            ? new Date(user.created_at).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/60 p-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-card">
                        <User2 className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Account
                        </p>
                        <p className="break-words text-sm text-muted-foreground">
                          {displayName || user.email || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 p-4 pt-0 sm:p-6 sm:pt-0">
                <Button asChild className="min-h-11 w-full justify-start">
                  <Link href="/dashboard">
                    <Building className="w-4 h-4 mr-2" />
                    Go to Dashboard
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="min-h-11 w-full justify-start"
                >
                  <Link href="/dashboard/create-job">
                    <Pencil className="w-4 h-4 mr-2" />
                    Create Job
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="min-h-11 w-full justify-start"
                >
                  <Link href="/dashboard/preventive-maintenance">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Maintenance
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Properties Summary */}
            <Card>
              <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <CardTitle className="text-lg">Properties</CardTitle>
                  <CardDescription>Your managed properties</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchUserProperties}
                  disabled={loadingProperties}
                  className="min-h-11 w-full sm:w-auto"
                >
                  {loadingProperties ? (
                    <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {loadingProperties ? (
                  <div className="text-center py-4">
                    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Loading properties...
                    </p>
                  </div>
                ) : userProperties.length > 0 ? (
                  <div className="space-y-2">
                    {userProperties.slice(0, 3).map((property, index) => (
                      <div
                        key={property.id || index}
                        className="flex items-center space-x-2 text-sm p-2 bg-muted rounded"
                      >
                        <Building className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground font-medium truncate block">
                            {property.name ||
                              `Property ${property.property_id || property.id || index + 1}`}
                          </span>
                          {property.description && (
                            <span className="text-xs text-muted-foreground truncate block">
                              {property.description}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {userProperties.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        +{userProperties.length - 3} more properties
                      </p>
                    )}
                  </div>
                ) : propertiesError ? (
                  <div className="text-center py-4 text-red-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                    <p className="text-sm font-medium">
                      Error loading properties
                    </p>
                    <p className="mt-1 break-words text-xs text-red-400">
                      {propertiesError}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchUserProperties}
                      className="mt-2"
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Building className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm">No properties assigned yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Contact your administrator
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
