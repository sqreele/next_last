'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { User2, Mail, Shield, Save, ArrowLeft, AlertCircle, Building2, Check } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { useUser } from '@/app/lib/user-context';
import { useProperty } from '@/app/lib/PropertyContext';
import { updateUserProfile } from '@/app/lib/data.server';

export default function EditProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading, refetch, forceRefresh } = useUser();
  const { userProperties, selectedProperty, setSelectedProperty, hasProperties } = useProperty();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    positions: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const profileId = params.id as string;

  console.log('🔍 EditProfilePage loaded with:', {
    profileId,
    hasUserProfile: !!userProfile,
    userProfileData: userProfile,
    loading,
    params
  });

  useEffect(() => {
    console.log('🔍 useEffect triggered with userProfile:', userProfile);
    if (userProfile) {
      console.log('🔍 User profile data loaded:', userProfile);
      setFormData({
        username: userProfile.username || '',
        email: userProfile.email || '',
        first_name: userProfile.first_name || '',
        last_name: userProfile.last_name || '',
        positions: userProfile.positions || ''
      });
      console.log('🔍 Form data initialized:', {
        username: userProfile.username || '',
        email: userProfile.email || '',
        first_name: userProfile.first_name || '',
        last_name: userProfile.last_name || '',
        positions: userProfile.positions || ''
      });
    }
  }, [userProfile]);

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="flex justify-center py-12">
            <div className="animate-pulse space-y-4 w-full max-w-md">
              <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
              <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userProfile) {
    router.push("/auth/login");
    return null;
  }

  // Verify that the user is editing their own profile
  if (String(userProfile.id) !== profileId) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="flex justify-center py-12">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground mb-4">
                You can only edit your own profile.
              </p>
              <Link href="/dashboard/profile">
                <Button variant="outline">Back to Profile</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      console.log('🔍 Form submission started with formData:', formData);
      
      // Create Auth0 profile data structure
      const auth0Profile = {
        email: formData.email,
        given_name: formData.first_name,
        family_name: formData.last_name,
        nickname: formData.username,
        name: `${formData.first_name} ${formData.last_name}`.trim()
      };

      console.log('🔍 Submitting profile update with data:', auth0Profile);
      console.log('🔍 Current user profile for comparison:', userProfile);

      // Get the current session to extract the access token
      const sessionResponse = await fetch('/api/auth/session-compat', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!sessionResponse.ok) {
        throw new Error('Failed to get session for profile update');
      }
      
      const session = await sessionResponse.json();
      const accessToken = session?.user?.accessToken;
      
      console.log('🔍 Session data retrieved:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasAccessToken: !!accessToken,
        accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : 'none'
      });
      
      if (!accessToken) {
        throw new Error('No access token available for profile update');
      }

      // Call the backend profile update endpoint with the access token
      const success = await updateUserProfile(auth0Profile, accessToken);
      
      if (success) {
        setMessage({
          type: 'success',
          text: 'Profile updated successfully! Refreshing data and redirecting...'
        });
        
        // Force refresh of user context data
        if (forceRefresh) {
          console.log('🔄 Refreshing user context data...');
          await forceRefresh();
        }
        
        // Redirect back to profile page after a short delay
        setTimeout(() => {
          router.push('/dashboard/profile');
        }, 2000);
      } else {
        setMessage({
          type: 'error',
          text: 'Failed to update profile. Please try again.'
        });
      }
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      setMessage({
        type: 'error',
        text: `An error occurred while updating your profile: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/profile">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl font-bold">Edit Profile</CardTitle>
          <CardDescription>Update your personal information and preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && (
              <div className={`p-4 rounded-lg border ${
                message.type === 'success' 
                  ? 'border-green-200 bg-green-50 text-green-800' 
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {message.type === 'success' ? (
                    <div className="w-4 h-4 rounded-full bg-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">{message.text}</span>
                </div>
              </div>
            )}

            {/* Test button to verify form submission */}
            <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800 mb-2">Debug: Test form submission</p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => {
                  console.log('🧪 Test button clicked');
                  console.log('🧪 Current formData:', formData);
                  console.log('🧪 Current userProfile:', userProfile);
                }}
              >
                Test Form Data
              </Button>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">
                  <div className="flex items-center gap-2">
                    <User2 className="w-4 h-4" />
                    Username
                  </div>
                </Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="Enter your username"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </div>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter your email address"
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    placeholder="Enter your first name"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    placeholder="Enter your last name"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="positions">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Position/Role
                  </div>
                </Label>
                <Input
                  id="positions"
                  value={formData.positions}
                  onChange={(e) => handleInputChange('positions', e.target.value)}
                  placeholder="Enter your position or role"
                  disabled={isSubmitting}
                />
              </div>

              {/* Property Selection Section */}
              <div className="space-y-3">
                <Label>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Default Property
                  </div>
                </Label>
                <div className="text-sm text-muted-foreground mb-3">
                  Select the property you want to manage by default
                </div>
                
                {hasProperties ? (
                  <div className="grid gap-3">
                    {userProperties.map((property) => (
                      <div
                        key={property.property_id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedProperty === String(property.property_id)
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50'
                        }`}
                        onClick={() => setSelectedProperty(String(property.property_id))}
                      >
                        <div className="flex items-center gap-3">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{property.name}</div>
                            <div className="text-sm text-muted-foreground">
                              ID: {property.property_id}
                            </div>
                          </div>
                        </div>
                        {selectedProperty === String(property.property_id) && (
                          <Check className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="text-center text-sm text-muted-foreground">
                      No properties available for selection
                    </div>
                  </div>
                )}
              </div>

              {/* Current Property Information */}
              {selectedProperty && (
                <div className="p-4 border border-green-200 rounded-lg bg-green-50">
                  <div className="flex items-center gap-2 text-green-800">
                    <Check className="w-4 h-4" />
                    <span className="font-medium">Default Property Set</span>
                  </div>
                  <div className="text-sm text-green-700 mt-1">
                    You will manage: {userProperties.find(p => String(p.property_id) === selectedProperty)?.name || 'Unknown Property'}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 sm:flex-none"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
              
              <Link href="/dashboard/profile" className="flex-1 sm:flex-none">
                <Button variant="outline" className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
