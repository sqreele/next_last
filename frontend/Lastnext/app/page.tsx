'use client';

import React from 'react';
import Link from 'next/link';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import {
  Building,
  Wrench,
  Shield,
  Users,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Play,
  Star,
  Zap,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { getDisplayName } from '@/app/lib/utils/display-name';

const features = [
  {
    icon: Building,
    iconClass: 'text-blue-600 bg-blue-50',
    title: 'Property Management',
    description:
      'Manage multiple properties and facilities from a single, unified workspace.',
  },
  {
    icon: Wrench,
    iconClass: 'text-emerald-600 bg-emerald-50',
    title: 'Preventive Maintenance',
    description:
      'Schedule and track maintenance tasks before issues become costly breakdowns.',
  },
  {
    icon: Shield,
    iconClass: 'text-purple-600 bg-purple-50',
    title: 'Security & Compliance',
    description:
      'Keep every facility aligned with safety and regulatory requirements.',
  },
  {
    icon: Users,
    iconClass: 'text-orange-600 bg-orange-50',
    title: 'Team Collaboration',
    description:
      'Coordinate technicians, vendors, and managers with real-time updates.',
  },
  {
    icon: BarChart3,
    iconClass: 'text-rose-600 bg-rose-50',
    title: 'Analytics & Reporting',
    description:
      'Track performance, downtime, and cost across every property.',
  },
  {
    icon: CheckCircle,
    iconClass: 'text-teal-600 bg-teal-50',
    title: 'Quality Assurance',
    description:
      'Automated quality checks and approvals keep service standards high.',
  },
];

const benefits = [
  'Reduce maintenance costs by up to 30%',
  'Increase equipment lifespan by 40%',
  'Improve team productivity by 50%',
  'Ensure 99.9% compliance rate',
  'Real-time monitoring and alerts',
  'Mobile-first responsive design',
];

export default function LandingPage() {
  const { isAuthenticated, user } = useSessionGuard({
    requireAuth: false,
    showToast: false,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
              <Building className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              HotelEngPro
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:block">
                  Welcome back, {getDisplayName(user, 'User')}
                </span>
                <Button asChild size="sm">
                  <Link href="/dashboard">
                    Dashboard
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/auth/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <span className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800 sm:text-sm">
            <Zap className="h-3.5 w-3.5" />
            New: AI-Powered Maintenance Predictions
          </span>

          <h1 className="mb-6 text-balance text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Streamline your{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              hotel engineering
            </span>{' '}
            operations
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-balance text-base text-slate-600 sm:text-lg lg:text-xl">
            The complete hotel engineering and maintenance management
            platform — maintain properties, coordinate teams, and optimize
            costs with intelligent automation.
          </p>

          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {isAuthenticated ? (
              <Button size="lg" asChild className="text-base">
                <Link href="/dashboard">
                  Continue to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild className="text-base">
                  <Link href="/auth/register">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base">
                  <Link href="#demo">
                    <Play className="mr-2 h-4 w-4" />
                    Watch Demo
                  </Link>
                </Button>
              </>
            )}
          </div>

          {/* Trust strip */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-slate-500 sm:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              No credit card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              14-day free trial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              Mobile-first
            </span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center sm:mb-16">
            <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Everything you need for hotel engineering management
            </h2>
            <p className="mx-auto max-w-2xl text-balance text-base text-slate-600 sm:text-lg">
              From preventive maintenance to team coordination, HotelEngPro
              has the tools your engineering team needs every day.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className="border border-slate-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <CardHeader>
                    <div
                      className={`mb-3 grid h-11 w-11 place-items-center rounded-xl ${feature.iconClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg sm:text-xl">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section
        id="demo"
        className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="mb-5 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Transform your hotel engineering operations
              </h2>
              <p className="mb-8 text-balance text-base text-slate-600 sm:text-lg">
                Join thousands of hotel engineers who have revolutionized
                their maintenance processes with HotelEngPro.
              </p>

              <ul className="space-y-3">
                {benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-3 text-slate-700"
                  >
                    <CheckCircle
                      className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
                      aria-hidden
                    />
                    <span className="text-sm sm:text-base">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Card className="overflow-hidden border-0 bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-xl">
              <CardContent className="p-8 sm:p-10">
                <Star className="mx-auto mb-4 h-10 w-10 sm:h-12 sm:w-12" />
                <h3 className="mb-2 text-center text-xl font-bold sm:text-2xl">
                  Trusted by hotel industry leaders
                </h3>
                <p className="mb-8 text-center text-sm text-blue-100 sm:text-base">
                  Join hotels that trust HotelEngPro with their engineering
                  management
                </p>
                <div className="grid grid-cols-2 gap-6 text-center">
                  <div>
                    <div className="text-2xl font-bold sm:text-3xl">500+</div>
                    <div className="text-xs text-blue-100 sm:text-sm">
                      Hotels
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold sm:text-3xl">10K+</div>
                    <div className="text-xs text-blue-100 sm:text-sm">
                      Engineers
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-900 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to get started?
          </h2>
          <p className="mb-8 text-balance text-base text-slate-300 sm:text-lg">
            Join thousands of hotel engineers who have already transformed
            their maintenance operations with HotelEngPro.
          </p>

          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {isAuthenticated ? (
              <Button size="lg" variant="secondary" asChild>
                <Link href="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" variant="secondary" asChild>
                  <Link href="/auth/register">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-slate-600 bg-transparent text-white hover:bg-white/10"
                >
                  <Link href="/auth/login">Sign In</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 px-4 py-12 text-slate-400 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4 flex items-center gap-2">
                <Building className="h-6 w-6 text-blue-500" />
                <span className="text-lg font-bold text-white">
                  HotelEngPro
                </span>
              </div>
              <p className="text-sm leading-relaxed">
                The complete hotel engineering and maintenance solution for
                modern hotels.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
                Product
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="#features" className="hover:text-white">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/auth/register" className="hover:text-white">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="#demo" className="hover:text-white">
                    Demo
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
                Company
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/auth/login" className="hover:text-white">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login" className="hover:text-white">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login" className="hover:text-white">
                    Careers
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
                Support
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/auth/login" className="hover:text-white">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login" className="hover:text-white">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login" className="hover:text-white">
                    System Status
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-800 pt-6 text-center text-xs sm:text-sm">
            <p>&copy; {new Date().getFullYear()} HotelEngPro. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
