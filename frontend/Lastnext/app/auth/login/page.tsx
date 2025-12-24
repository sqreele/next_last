'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { Building, ArrowRight, Shield, Users, Wrench, CheckCircle2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get('message');
  
  // Check if user is already authenticated
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({ 
    requireAuth: false, 
    showToast: false 
  });

  // Redirect to dashboard if already authenticated
  React.useEffect(() => {
    if (isAuthenticated && !sessionLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, sessionLoading, router]);

  const handleAuth0Login = () => {
    // Redirect to your existing Auth0 login flow
    router.push('/api/auth/login');
  };

  // Show loading while checking session
  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-lg font-medium text-gray-600">Checking session...</p>
        </div>
      </div>
    );
  }

  // Don't render login form if already authenticated
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-4xl">
        {/* Success message from onboarding */}
        {message === 'onboarding_complete' && (
          <Alert className="mb-6 max-w-md mx-auto bg-green-50 border-green-200">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <AlertDescription className="text-green-800 ml-2">
              <strong>Account setup complete!</strong> Please sign in to access your dashboard with your new permissions.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-blue-100 rounded-full">
              <Building className="w-12 h-12 text-blue-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to MaintenancePro
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            The complete facility management solution that helps you maintain properties, 
            coordinate teams, and optimize costs with intelligent automation.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-green-100 rounded-full w-16 h-16 flex items-center justify-center">
                <Wrench className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-xl">Preventive Maintenance</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600">
                Schedule and track maintenance tasks to prevent costly breakdowns and 
                ensure your equipment runs at peak efficiency.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-purple-100 rounded-full w-16 h-16 flex items-center justify-center">
                <Users className="w-8 h-8 text-purple-600" />
              </div>
              <CardTitle className="text-xl">Team Collaboration</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600">
                Coordinate maintenance teams and track work progress in real-time 
                with powerful collaboration tools.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Sign in to your account
            </CardTitle>
            <p className="text-gray-600">
              Access your maintenance dashboard and manage your facilities
            </p>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Button 
              onClick={handleAuth0Login}
              className="w-full h-12 text-lg"
              size="lg"
            >
              Continue with Auth0
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <div className="text-center text-sm text-gray-500">
              Secure authentication powered by Auth0
            </div>
            
            <div className="border-t pt-4">
              <div className="text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <Link 
                  href="/auth/register" 
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Contact your administrator
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
