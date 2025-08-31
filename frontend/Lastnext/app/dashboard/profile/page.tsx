'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { Building, User2, Mail, Calendar, Shield, Pencil, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, isLoading } = useSessionGuard({ requireAuth: true });
  const [userProperties, setUserProperties] = useState<any[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  // Fetch user properties when component mounts
  useEffect(() => {
    if (isAuthenticated && user?.accessToken) {
      fetchUserProperties();
    }
  }, [isAuthenticated, user?.accessToken]);

  const fetchUserProperties = async () => {
    try {
      setLoadingProperties(true);
      console.log('🔍 Fetching user properties...');
      
      // Fetch properties from the API
      const response = await fetch('/api/properties/', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('🔍 Properties API response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Properties API error response:', errorText);
        throw new Error(`Failed to fetch properties: ${response.status} ${response.statusText}`);
      }

      const properties = await response.json();
      console.log('✅ Properties fetched successfully:', properties);
      console.log('✅ Properties count:', properties?.length || 0);
      
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
        console.log('🔄 Using properties from user session as fallback:', user.properties);
        setUserProperties(user.properties);
      } else {
        setUserProperties([]);
      }
    } finally {
      setLoadingProperties(false);
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-lg font-medium text-gray-600">Loading profile...</p>
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <Card className="max-w-md mx-auto">
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
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
          <p className="text-gray-600">Manage your personal information and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
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
                <div className="flex items-center space-x-4">
                  {user.profile_image ? (
                    <div className="relative">
                      <img 
                        src={user.profile_image} 
                        alt={`${user.username || 'User'}'s profile`}
                        className="w-20 h-20 rounded-full object-cover border-2 border-blue-200"
                        onError={(e) => {
                          // If image fails to load, hide it and show fallback
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center border-2 border-blue-200 hidden">
                        <span className="text-2xl font-bold text-blue-600">
                          {getUserInitials(user.username || user.email || 'User')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center border-2 border-blue-200">
                      <span className="text-2xl font-bold text-blue-600">
                        {getUserInitials(user.username || user.email || 'User')}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">{user.username || 'User'}</h3>
                    <Badge variant="secondary">{user.positions || 'User'}</Badge>
                  </div>
                </div>

                {/* Debug Section - Remove this after fixing */}
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">🔍 Debug Info (Remove after fixing)</h4>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>Profile Image: {user.profile_image ? `✅ ${user.profile_image}` : '❌ Not set'}</div>
                    <div>Username: {user.username || '❌ Not set'}</div>
                    <div>Email: {user.email || '❌ Not set'}</div>
                    <div>User ID: {user.id || '❌ Not set'}</div>
                    <div>Properties Count: {userProperties.length}</div>
                    <div>Properties Loading: {loadingProperties ? 'Yes' : 'No'}</div>
                    <div>Properties Error: {propertiesError || 'None'}</div>
                    <div>Session Properties Count: {user?.properties?.length || 0}</div>
                    <div>All User Fields: {Object.keys(user).join(', ')}</div>
                    {user.auth0_profile && (
                      <div>Auth0 Profile Fields: {Object.keys(user.auth0_profile).join(', ')}</div>
                    )}
                    <div className="mt-2 pt-2 border-t">
                      <div>Access Token: {user.accessToken ? `✅ ${user.accessToken.substring(0, 20)}...` : '❌ Not set'}</div>
                      <div>Token Expires: {user.accessTokenExpires ? new Date(user.accessTokenExpires).toLocaleString() : '❌ Not set'}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <Mail className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Email</p>
                      <p className="text-sm text-gray-600">{user.email || 'N/A'}</p>
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
                      <p className="text-sm font-medium text-gray-900">User ID</p>
                      <p className="text-sm text-gray-600 font-mono">{user.id || 'N/A'}</p>
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
                  <Link href="/dashboard/createJob">
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
              <CardHeader className="flex flex-row items-center justify-between">
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
