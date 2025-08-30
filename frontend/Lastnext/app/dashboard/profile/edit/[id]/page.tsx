'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { User2, Mail, Shield, Save, ArrowLeft, AlertCircle } from 'lucide-react';
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
import { updateUserProfile } from '@/app/lib/data.server';

export default function EditProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { userProfile, loading, refetch } = useUser();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    positions: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Get the profile ID from the URL
  const profileId = params?.id as string;

  useEffect(() => {
    if (userProfile) {
      setFormData({
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
  console.log('🔍 Profile ID Debug:', {
    userProfileId: userProfile.id,
    profileId: profileId,
    userProfileIdString: String(userProfile.id),
    profileIdString: String(profileId),
    comparison: String(userProfile.id) === profileId,
    userProfileType: typeof userProfile.id,
    profileIdType: typeof profileId
  });

  if (String(userProfile.id) !== profileId) {
    console.log('❌ Access denied - ID mismatch:', {
      userProfileId: userProfile.id,
      profileId: profileId
    });
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
              <p className="text-sm text-muted-foreground mb-4">
                Debug: userProfile.id = {String(userProfile.id)}, profileId = {profileId}
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
      // Create Auth0 profile data structure
      const auth0Profile = {
        email: formData.email,
        given_name: formData.first_name,
        family_name: formData.last_name,
        nickname: formData.username,
        name: `${formData.first_name} ${formData.last_name}`.trim()
      };

      // Call the backend profile update endpoint
      const success = await updateUserProfile(auth0Profile);
      
      if (success) {
        setMessage({
          type: 'success',
          text: 'Profile updated successfully!'
        });
        
        // Refresh user profile data
        if (refetch) {
          refetch();
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
      console.error('Error updating profile:', error);
      setMessage({
        type: 'error',
        text: 'An error occurred while updating your profile.'
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
