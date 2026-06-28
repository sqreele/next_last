'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { useMinLoaderTime } from '@/app/lib/hooks/useMinLoaderTime';
import { Building, User2, Mail, Calendar, Shield, Pencil, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { fixImageUrl } from '@/app/lib/utils/image-utils';
import { getDisplayName } from '@/app/lib/utils/display-name';
import Image from 'next/image';

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, isLoading } = useSessionGuard({ requireAuth: true });
  const [userProperties, setUserProperties] = useState<any[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const { recordLoaderShown, clearLoadingAfterMinTime } = useMinLoaderTime(setLoadingProperties);

  // Process profile image URL
  const profileImageUrl = user?.profile_image ? fixImageUrl(user.profile_image) : null;
  const displayName = getDisplayName(user, 'User');

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
      const response = await fetch('/api/properties/', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Properties API error response:', errorText);
        throw new Error(`Failed to fetch properties: ${response.status} ${response.statusText}`);
      }

      const properties = await response.json();
      
      if (Array.isArray(properties)) {
        setUserProperties(properties);
        setPropertiesError(null);
      } else {
        console.warn('⚠️ Properties response is not an array:', properties);
        setUserProperties([]);
        setPropertiesError('Invalid properties data format');
      }
      
    } catch (error) {
      console.error('❌ Error fetching properties:', error);
      setPropertiesError(error instanceof Error ? error.message : 'Failed to fetch properties');
      
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
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length === 1) return names[0][0];
    return `${names[0][0]}${names[1][0]}`;
  };

  // Show loading while checking session
  if (isLoading) {
    return (
      <div className="w-full px-3 py-4 sm:px-4 md:px-5">
        <div className="pcms-section-card py-12 text-center">
          <div className="space-y-4">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--pcms-primary)]"></div>
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
                <h2 className="text-xl font-semibold text-gray-900">Profile Not Found</h2>
                <p className="text-gray-600">Unable to load user profile information.</p>
                <Button onClick={() => router.push('/dashboard')}>
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
        <div>
          <p className="pcms-eyebrow">Account workspace</p>
          <h1>Profile</h1>
          <p className="pcms-page-description">Manage your account details, properties, and access context.</p>
        </div>
      </div>

      <div className="w-full max-w-none lg:mx-auto lg:max-w-7xl desktop:max-w-[94rem]">

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Profile Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Personal Information</CardTitle>
                  <CardDescription>Your account details and preferences</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  {profileImageUrl ? (
                    <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-blue-200">
                      <Image 
                        src={profileImageUrl} 
                        alt={`${displayName}'s profile`}
                        fill
                        className="object-cover"
                        quality={75}
                        unoptimized={profileImageUrl.startsWith('http')}
                        onError={(e) => {
                          // If image fails to load, hide it and show fallback
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center border-2 border-blue-200 hidden">
                        <span className="text-2xl font-bold text-blue-600">
                          {getUserInitials(displayName)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center border-2 border-blue-200">
                      <span className="text-2xl font-bold text-blue-600">
                        {getUserInitials(displayName)}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">{displayName}</h3>
                    <Badge variant="secondary">{user.positions || 'User'}</Badge>
                  </div>
                </div>

                {/* Profile Details */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-3">
                      <Mail className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Email</p>
                        <p className="text-sm text-gray-600">{user.email || 'Not provided'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <Shield className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Position</p>
                        <p className="text-sm text-gray-600">{user.positions || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Member Since</p>
                        <p className="text-sm text-gray-600">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <User2 className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Account</p>
                        <p className="text-sm text-gray-600">{displayName || user.email || 'N/A'}</p>
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
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full justify-start">
                  <Link href="/dashboard">
                    <Building className="w-4 h-4 mr-2" />
                    Go to Dashboard
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/create-job">
                    <Pencil className="w-4 h-4 mr-2" />
                    Create Job
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/preventive-maintenance">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Maintenance
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Properties Summary */}
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Properties</CardTitle>
                  <CardDescription>Your managed properties</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchUserProperties}
                  disabled={loadingProperties}
                >
                  {loadingProperties ? (
                    <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                {loadingProperties ? (
                  <div className="text-center py-4">
                    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Loading properties...</p>
                  </div>
                ) : userProperties.length > 0 ? (
                  <div className="space-y-2">
                    {userProperties.slice(0, 3).map((property, index) => (
                      <div key={property.id || index} className="flex items-center space-x-2 text-sm p-2 bg-gray-50 rounded">
                        <Building className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-700 font-medium truncate block">
                            {property.name || `Property ${property.property_id || property.id || index + 1}`}
                          </span>
                          {property.description && (
                            <span className="text-xs text-gray-500 truncate block">
                              {property.description}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {userProperties.length > 3 && (
                      <p className="text-xs text-gray-500 text-center pt-2">
                        +{userProperties.length - 3} more properties
                      </p>
                    )}
                  </div>
                ) : propertiesError ? (
                  <div className="text-center py-4 text-red-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                    <p className="text-sm font-medium">Error loading properties</p>
                    <p className="text-xs text-red-400 mt-1">{propertiesError}</p>
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
                  <div className="text-center py-4 text-gray-500">
                    <Building className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">No properties assigned yet</p>
                    <p className="text-xs text-gray-400 mt-1">Contact your administrator</p>
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
