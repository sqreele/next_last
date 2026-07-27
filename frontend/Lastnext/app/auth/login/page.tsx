'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Button } from '@/app/components/ui/button';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';

const capabilities = [
  {
    icon: ClipboardCheck,
    title: 'One operational view',
    description: 'Work orders, rooms, assets and teams in one place.',
  },
  {
    icon: Wrench,
    title: 'Built for engineering teams',
    description: 'Clear priorities, ownership and maintenance history.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure property access',
    description: 'Role-based access for every hotel and department.',
  },
];

const authErrorMessages: Record<string, string> = {
  access_denied: 'Access was not granted. Please try again or contact your administrator.',
  callback_error: 'We could not complete sign in. Please try again.',
  config_error: 'Authentication is not configured correctly. Please contact support.',
  invalid_request: 'This sign-in request could not be completed.',
  invalid_state: 'Your sign-in session expired. Please start again.',
  no_code: 'The identity service did not return a valid sign-in code. Please start again.',
  token_exchange_error: 'We could not securely complete sign in. Please try again.',
  token_exchange_failed: 'We could not verify the sign-in response. Please try again.',
};

function LoadingState({ label = 'Checking your session…' }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-50/95 px-6 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get('message');
  const authError = searchParams.get('error');
  const authErrorDescription = searchParams.get('error_description');
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({
    requireAuth: false,
    showToast: false,
  });

  React.useEffect(() => {
    if (isAuthenticated && !sessionLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, sessionLoading, router]);

  const handleSecureLogin = () => {
    setIsRedirecting(true);
    router.push('/api/auth/login');
  };

  if (sessionLoading) {
    return <LoadingState />;
  }

  if (isAuthenticated) {
    return null;
  }

  if (isRedirecting) {
    return <LoadingState label="Opening secure sign in…" />;
  }

  const visibleError = authError
    ? authErrorMessages[authError] || authErrorDescription || 'Sign in was not completed. Please try again.'
    : null;

  return (
    <main className="min-h-screen bg-slate-950 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-white/10 px-12 py-10 text-white lg:flex lg:flex-col xl:px-20 xl:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.28),transparent_34%),radial-gradient(circle_at_82%_78%,rgba(14,165,233,0.15),transparent_30%)]" />
        <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">HotelCare Pro</p>
            <p className="text-xs text-slate-400">Engineering operations platform</p>
          </div>
        </div>

        <div className="relative my-auto max-w-2xl py-16">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Built for modern hotel operations
          </div>
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.035em] xl:text-6xl">
            Keep every property running at its best.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 xl:text-lg">
            Coordinate maintenance, improve response times and give every team a
            reliable view of hotel operations.
          </p>

          <div className="mt-12 grid gap-5">
            {capabilities.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex max-w-xl items-start gap-4">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-blue-300">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <LockKeyhole className="h-3.5 w-3.5" />
          Secure authentication for hotel operations
        </div>
      </section>

      <section className="flex min-h-screen flex-col bg-slate-50">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:justify-end lg:px-12">
          <Link
            href="/"
            className="flex items-center gap-2.5 lg:hidden"
            aria-label="HotelCare Pro home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight text-slate-900">HotelCare Pro</span>
          </Link>
          <div className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Secure sign in
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <p className="mb-2 text-sm font-semibold text-blue-700">Welcome back</p>
              <h2 className="text-3xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-4xl">
                Sign in to your workspace
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Continue securely to manage your assigned properties, maintenance
                work and engineering operations.
              </p>
            </div>

            {message === 'onboarding_complete' && (
              <Alert className="mb-5 border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="ml-2 text-sm text-emerald-800">
                  Account setup complete. Sign in to continue.
                </AlertDescription>
              </Alert>
            )}

            {visibleError && (
              <Alert className="mb-5 border-red-200 bg-red-50">
                <AlertDescription className="text-sm text-red-800">
                  <span className="font-semibold">Unable to sign in.</span>{' '}
                  {visibleError}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleSecureLogin}
              className="h-12 w-full rounded-xl shadow-lg shadow-blue-600/15"
              size="lg"
              isLoading={isRedirecting}
              loadingText="Opening secure sign in…"
            >
              Continue securely
              <ArrowRight className="ml-auto h-4 w-4" />
            </Button>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <Check className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs leading-5 text-slate-600">
                Your credentials are handled by our secure identity service.
                HotelCare Pro never stores your password.
              </p>
            </div>

            <p className="mt-8 text-center text-sm text-slate-500">
              Need access to a property?{' '}
              <Link
                href="/contact"
                className="font-semibold text-blue-700 underline-offset-4 hover:underline"
              >
                Contact your administrator
              </Link>
            </p>
          </div>
        </div>

        <footer className="px-5 py-6 text-center text-xs text-slate-400 sm:px-8">
          © {new Date().getFullYear()} HotelCare Pro · Secure hotel operations
        </footer>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading sign in…" />}>
      <LoginContent />
    </Suspense>
  );
}
