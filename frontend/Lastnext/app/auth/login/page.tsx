'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { Building, ArrowRight, Shield, Users, Wrench, CheckCircle2, Loader } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import Link from 'next/link';

// Loading fallback component
function LoginLoadingFallback() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
        <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
      </div>
      <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
        Loading, please wait…
      </p>
    </div>
  );
}

// Main login content component that uses useSearchParams
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get('message');
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  // Check if user is already authenticated
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({
    requireAuth: false,
    showToast: false,
  });

  // Redirect to dashboard if already authenticated
  React.useEffect(() => {
    if (isAuthenticated && !sessionLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, sessionLoading, router]);

  const handleAuth0Login = () => {
    setIsRedirecting(true);
    router.push('/api/auth/login');
  };

  // Show loading while checking session
  if (sessionLoading) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
        aria-live="polite"
        aria-busy="true"
        role="status"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
          <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
        <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
          Checking session, please wait…
        </p>
      </div>
    );
  }

  // Don't render login form if already authenticated
  if (isAuthenticated) {
    return null;
  }

  // Full-screen overlay after user clicks sign in (until redirect)
  if (isRedirecting) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
        aria-live="polite"
        aria-busy="true"
        role="status"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
          <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
        <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
          Signing in, please wait…
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="relative flex min-h-screen w-full max-w-none flex-col px-3 py-6 sm:px-6 sm:py-8 lg:mx-auto lg:max-w-6xl lg:px-8">
        {/* Top brand bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
              <Building className="h-5 w-5" />
            </div>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              PCMS
            </span>
          </div>
          <span className="hidden text-xs font-semibold text-slate-500 sm:inline">
            Hotel maintenance operations
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-none lg:max-w-5xl">
            {message === 'onboarding_complete' && (
              <Alert className="mx-auto mb-6 max-w-md border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <AlertDescription className="ml-2 text-emerald-800">
                  <strong>Account setup complete.</strong> Sign in to access your dashboard.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
              {/* Left: pitch */}
              <div className="space-y-6 lg:pr-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Property Care Maintenance System
                </div>
                <h1 className="text-balance text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
                  Hotel maintenance,{' '}
                  <span className="bg-gradient-to-br from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    organized clearly.
                  </span>
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                  Track jobs across rooms and areas, capture before/after photos,
                  and give Chief Engineers, Technicians and GMs a single source of
                  truth for every issue.
                </p>

                <ul className="grid gap-3 sm:grid-cols-2">
                  <li className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm backdrop-blur">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Wrench className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">Workflow</p>
                      <p className="text-xs text-slate-600">Clear status, priority and photos for every job.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm backdrop-blur">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                      <Users className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">Visibility</p>
                      <p className="text-xs text-slate-600">KPI dashboard and PDF reports for leadership.</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Right: sign-in card */}
              <Card className="w-full max-w-none border-slate-200/80 bg-white/95 shadow-xl shadow-slate-900/[0.06] backdrop-blur sm:mx-auto sm:max-w-md">
                <CardHeader className="space-y-3 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700">
                    <Shield className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl text-slate-900">
                    Sign in to PCMS
                  </CardTitle>
                  <p className="text-sm text-slate-600">
                    Access your maintenance dashboard and properties.
                  </p>
                </CardHeader>

                <CardContent className="space-y-4">
                  <Button
                    onClick={handleAuth0Login}
                    className="w-full"
                    size="lg"
                    isLoading={isRedirecting}
                    loadingText="Signing in…"
                  >
                    Continue with single sign-on
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>

                  <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Shield className="h-3.5 w-3.5" />
                    Secure authentication powered by Auth0
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-center text-sm text-slate-600">
                      Don&apos;t have an account?{' '}
                      <Link
                        href="/auth/register"
                        className="font-semibold text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline"
                      >
                        Contact your administrator
                      </Link>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <footer className="mt-auto text-center text-xs text-slate-500">
          © {new Date().getFullYear()} PCMS · Hotel maintenance operations
        </footer>
      </div>
    </div>
  );
}

// Default export wraps LoginContent in Suspense boundary for useSearchParams
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoadingFallback />}>
      <LoginContent />
    </Suspense>
  );
}
