'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building, Mail, Check, Loader2, ArrowRight, User, CheckCircle2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Checkbox } from '@/app/components/ui/checkbox';
import { useToast } from '@/app/components/ui/use-toast';

interface Property {
  id: number;
  property_id: string;
  name: string;
  description?: string;
}

interface OnboardingSession {
  user?: {
    id: string;
    username: string;
    email: string;
    profile_image?: string;
    accessToken: string;
    auth0_profile?: {
      sub: string;
      email: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fetch session and all properties on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current session
        const sessionRes = await fetch('/api/auth/session-compat', {
          credentials: 'include',
          cache: 'no-store'
        });
        
        if (!sessionRes.ok) {
          console.error('Failed to fetch session');
          router.push('/auth/login');
          return;
        }
        
        const sessionData = await sessionRes.json();
        
        if (!sessionData?.user?.accessToken) {
          console.error('No access token in session');
          router.push('/auth/login');
          return;
        }
        
        setSession(sessionData);
        
        // Fetch ALL properties (admin endpoint for onboarding)
        const propertiesRes = await fetch('/api/auth/onboarding/properties', {
          headers: {
            'Authorization': `Bearer ${sessionData.user.accessToken}`,
          },
          credentials: 'include',
        });
        
        if (propertiesRes.ok) {
          const propertiesData = await propertiesRes.json();
          setAllProperties(propertiesData.properties || []);
        } else {
          console.error('Failed to fetch properties');
          toast({
            title: 'Error',
            description: 'Failed to load properties. Please try again.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error fetching onboarding data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load onboarding data.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [router, toast]);

  const handlePropertyToggle = (propertyId: number) => {
    setSelectedProperties(prev => {
      if (prev.includes(propertyId)) {
        return prev.filter(id => id !== propertyId);
      }
      return [...prev, propertyId];
    });
  };

  const handleSelectAll = () => {
    if (selectedProperties.length === allProperties.length) {
      setSelectedProperties([]);
    } else {
      setSelectedProperties(allProperties.map(p => p.id));
    }
  };

  const handleSubmit = async () => {
    if (!session?.user) {
      toast({
        title: 'Error',
        description: 'Session expired. Please login again.',
        variant: 'destructive',
      });
      router.push('/auth/login');
      return;
    }

    if (selectedProperties.length === 0) {
      toast({
        title: 'Please select at least one property',
        description: 'You need to select at least one property to continue.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Update user profile with selected properties
      const response = await fetch('/api/auth/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          property_ids: selectedProperties,
          email: session.user.email,
          username: session.user.username,
          auth0_sub: session.user.auth0_profile?.sub,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete onboarding');
      }

      const result = await response.json();
      
      setSubmitSuccess(true);
      
      toast({
        title: 'Profile Updated Successfully!',
        description: 'Your account has been set up. Redirecting to login...',
      });

      // Wait 2 seconds then redirect to login to refresh session
      setTimeout(() => {
        // Clear the session cookie to force re-login
        document.cookie = 'auth0_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        router.push('/auth/login?message=onboarding_complete');
      }, 2000);

    } catch (error) {
      console.error('Onboarding error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to complete onboarding',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
          <p className="text-lg font-medium text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100">
        <Card className="w-full max-w-md mx-4 shadow-xl border-0">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Setup Complete!</h2>
            <p className="text-gray-600 mb-4">
              Your account has been configured successfully.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting you to login...
            </p>
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mt-4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <User className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to MaintenancePro!
          </h1>
          <p className="text-gray-600">
            Let&apos;s set up your account to get started
          </p>
        </div>

        {/* User Info Card */}
        <Card className="mb-6 shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="w-5 h-5 text-blue-600" />
              Your Account Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Email</span>
                <span className="font-medium text-gray-900">{session?.user?.email || 'Not available'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Username</span>
                <span className="font-medium text-gray-900">{session?.user?.username || 'Not set'}</span>
              </div>
              {session?.user?.auth0_profile?.name && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Full Name</span>
                  <span className="font-medium text-gray-900">{session.user.auth0_profile.name}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Properties Selection Card */}
        <Card className="mb-6 shadow-lg border-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building className="w-5 h-5 text-blue-600" />
                  Select Your Properties
                </CardTitle>
                <CardDescription className="mt-1">
                  Choose the properties you have access to
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedProperties.length === allProperties.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {allProperties.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Building className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No properties available</p>
                <p className="text-sm mt-1">Contact your administrator to add properties</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allProperties.map((property) => (
                  <div
                    key={property.id}
                    className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedProperties.includes(property.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => handlePropertyToggle(property.id)}
                  >
                    <Checkbox
                      checked={selectedProperties.includes(property.id)}
                      onCheckedChange={() => handlePropertyToggle(property.id)}
                      className="h-5 w-5"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{property.name}</div>
                      <div className="text-sm text-gray-500">ID: {property.property_id}</div>
                      {property.description && (
                        <div className="text-sm text-gray-400 mt-1">{property.description}</div>
                      )}
                    </div>
                    {selectedProperties.includes(property.id) && (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedProperties.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>{selectedProperties.length}</strong> {selectedProperties.length === 1 ? 'property' : 'properties'} selected
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || selectedProperties.length === 0}
          className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Complete Setup
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>

        <p className="text-center text-sm text-gray-500 mt-4">
          After completing setup, you&apos;ll be redirected to login with your new permissions
        </p>
      </div>
    </div>
  );
}

