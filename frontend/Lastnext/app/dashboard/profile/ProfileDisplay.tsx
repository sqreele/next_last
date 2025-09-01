"use client";

import React, { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User2, Mail, Calendar, Shield, Pencil, Building2, Plus, AlertCircle, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { ProfileImage } from "@/app/components/profile/ProfileImage";
import { useUser, useProperties } from "@/app/lib/stores/mainStore";
import { UserProfile, Property } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";

// Define PropertyCardProps
interface PropertyCardProps {
  property: Property;
}

// Profile field props
interface ProfileFieldProps {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}

type ProfileFieldKey = 'username' | 'email' | 'positions' | 'created_at' | 'id' | 'profile_image';

type ProfileFieldDefinition = {
  icon: React.ElementType;
  label: string;
  key: ProfileFieldKey;
  format?: (value: string) => string;
};

const PROFILE_FIELDS: ProfileFieldDefinition[] = [
  { icon: User2, label: "Username", key: "username" },
  { icon: Mail, label: "Email", key: "email" },
  { icon: Shield, label: "Position", key: "positions" },
  {
    icon: Calendar,
    label: "Member Since",
    key: "created_at",
    format: (date: string) =>
      new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
  },
];

function ProfileField({ icon: Icon, label, value }: ProfileFieldProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-sm text-muted-foreground">{value ?? "N/A"}</p>
      </div>
    </div>
  );
}

function PropertyCard({ property }: PropertyCardProps) {
  const { selectedPropertyId, setSelectedPropertyId } = useUser();

  const isSelected = selectedPropertyId === String(property.property_id);

  const handleSelectProperty = useCallback(() => {
    const propId = String(property.property_id);
    setSelectedPropertyId(propId);
  }, [property.property_id, setSelectedPropertyId]);

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3 transition-colors duration-150 touch-manipulation",
        isSelected
          ? "border-blue-400 bg-blue-50"
          : "hover:border-blue-200 hover:bg-blue-50"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">{property.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{property.property_id}</Badge>
          <Button
            variant={isSelected ? "default" : "ghost"}
            size="sm"
            onClick={handleSelectProperty}
            className={cn(
              "text-xs min-h-[36px]",
              isSelected
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "hover:bg-blue-100 hover:text-blue-700"
            )}
          >
            {isSelected ? "Selected" : "Select"}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{property.description || "No description"}</p>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {property.created_at ? new Date(property.created_at).toLocaleDateString() : "N/A"}
        </span>
      </div>
    </div>
  );
}

function NoPropertiesCard() {
  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader className="pb-2 sm:pb-4">
        <CardTitle className="text-xl font-bold text-blue-800">Property Access</CardTitle>
        <CardDescription className="text-blue-700">
          You don't have any properties assigned to your account yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-4">
        <div className="flex flex-col items-center justify-center text-center p-4 sm:p-6 space-y-4">
          <Building2 className="h-12 w-12 sm:h-16 sm:w-16 text-blue-300" />
          <div className="space-y-2">
            <p className="text-blue-800 font-medium">
              Properties are required to fully use the maintenance dashboard
            </p>
            <p className="text-blue-700 text-sm">
              Properties are typically assigned by administrators. You can request access or contact your system administrator for assistance.
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 justify-center border-t border-blue-200 px-4 py-4 bg-blue-100/50">
        <Button
          asChild
          variant="outline"
          className="w-full h-12 border-blue-300 hover:border-blue-400 hover:bg-blue-100 text-blue-700"
        >
          <Link href="/dashboard/properties/request">
            <Building2 className="mr-2 h-4 w-4" />
            Request Property Access
          </Link>
        </Button>
        <Button asChild className="w-full h-12 bg-blue-600 hover:bg-blue-700">
          <Link href="/dashboard/createJob">
            <Plus className="mr-2 h-4 w-4" />
            Create Job Anyway
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <Card>
        <CardContent className="flex justify-center py-12 sm:py-20">
          <div className="animate-pulse space-y-8 w-full max-w-md">
            <div className="flex justify-center">
              <div className="w-24 h-24 bg-muted rounded-full" />
            </div>
            <div className="space-y-4">
              <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
              <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfileDisplay() {
  const router = useRouter();
  const { userProfile } = useUser();
  const { properties: userProperties, propertyLoading: loading } = useProperties();
  
  // Check if user has properties
  const hasProperties = userProperties && userProperties.length > 0;

  console.log('🔍 ProfileDisplay component loaded with:', {
    userProfile,
    loading,
    hasUserProfile: !!userProfile,
    userProfileId: userProfile?.id,
    editLinkUrl: userProfile ? `/dashboard/profile/edit/${userProfile.id}` : 'none'
  });

  if (loading) {
    return <LoadingSkeleton />;
  }

  useEffect(() => {
    if (!loading && !userProfile) {
      console.log('❌ No userProfile, redirecting to login');
      router.replace("/auth/login");
    }
  }, [loading, userProfile, router]);

  if (!userProfile) {
    return null;
  }

  // Use PropertyContext for properties instead of userProfile.properties

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 sm:pb-6">
          <div>
            <CardTitle className="text-xl sm:text-2xl font-bold">Profile</CardTitle>
            <CardDescription>Manage your personal information and preferences</CardDescription>
          </div>
          <Link href={`/dashboard/profile/edit/${userProfile.id}`} className="mt-2 sm:mt-0">
            <Button variant="outline" size="sm" className="w-full sm:w-auto h-10 flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Profile
            </Button>
          </Link>
          
          {/* Debug button to test navigation */}
          <Button 
            variant="secondary" 
            size="sm" 
            className="mt-2 sm:mt-0"
            onClick={() => {
              console.log('🧪 Debug button clicked');
              console.log('🧪 userProfile.id:', userProfile.id);
              console.log('🧪 Edit URL:', `/dashboard/profile/edit/${userProfile.id}`);
              console.log('🧪 Attempting navigation...');
              router.push(`/dashboard/profile/edit/${userProfile.id}`);
            }}
          >
            Debug: Go to Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 sm:space-y-8">
          <div className="flex flex-col items-center justify-center space-y-4">
            <ProfileImage
              src={userProfile.profile_image}
              alt={`${userProfile.username}'s profile`}
              size="md"
            />
            <div className="text-center">
              <h3 className="text-lg sm:text-xl font-semibold">{userProfile.username}</h3>
              <Badge variant="secondary" className="mt-2">
                {userProfile.positions}
              </Badge>
            </div>
          </div>

          <div className="grid gap-6">
            {PROFILE_FIELDS.map(({ icon, label, key, format }) => (
              <ProfileField
                key={key}
                icon={icon}
                label={label}
                value={
                  userProfile[key] != null
                    ? format
                      ? format(String(userProfile[key]))
                      : String(userProfile[key])
                    : null
                }
              />
            ))}
            
            {/* Display Auth0 ID separately */}
            <ProfileField
              icon={User}
              label="Auth0 ID"
              value={String(userProfile.id)}
            />
          </div>
        </CardContent>
      </Card>

      {hasProperties ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl font-bold">Managed Properties</CardTitle>
            <CardDescription>Properties under your supervision</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {userProperties.map((property: Property) => (
              <PropertyCard key={property.property_id} property={property} />
            ))}
          </CardContent>
          <CardFooter className="border-t pt-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="text-sm text-muted-foreground text-center sm:text-left">
              {userProfile.properties.length}{" "}
              {userProfile.properties.length === 1 ? "property" : "properties"} assigned
            </div>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto h-10">
              <Link href="/dashboard">
                <Building2 className="mr-2 h-4 w-4" />
                View Dashboard
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <NoPropertiesCard />
      )}
    </div>
  );
}