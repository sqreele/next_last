'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Check,
  ClipboardCheck,
  ShieldCheck,
  Users,
} from 'lucide-react';

import RegisterForm from '@/app/components/profile/RegisterForm';

const benefits = [
  {
    icon: ClipboardCheck,
    title: 'Structured maintenance',
    description: 'Keep requests, priorities and progress clear from day one.',
  },
  {
    icon: Users,
    title: 'Connected hotel teams',
    description: 'Coordinate engineering, operations and leadership.',
  },
  {
    icon: ShieldCheck,
    title: 'Controlled property access',
    description: 'Your administrator approves access to each property.',
  },
];

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-slate-950 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(520px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-white/10 px-12 py-10 text-white lg:flex lg:flex-col xl:px-20 xl:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.28),transparent_34%),radial-gradient(circle_at_82%_78%,rgba(14,165,233,0.15),transparent_30%)]" />
        <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px]" />

        <Link href="/" className="relative flex w-fit items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">HotelCare Pro</p>
            <p className="text-xs text-slate-400">Engineering operations platform</p>
          </div>
        </Link>

        <div className="relative my-auto max-w-2xl py-16">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            A better standard for hotel maintenance
          </div>
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.035em] xl:text-6xl">
            Build a more reliable operation.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 xl:text-lg">
            Create your account, connect to your assigned properties and give your
            team the clarity to act faster.
          </p>

          <div className="mt-12 grid gap-5">
            {benefits.map(({ icon: Icon, title, description }) => (
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
          <Check className="h-3.5 w-3.5" />
          Purpose-built for hotel engineering and operations teams
        </div>
      </section>

      <section className="flex min-h-screen flex-col bg-slate-50">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
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
          <Link
            href="/auth/login"
            className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-7">
              <p className="mb-2 text-sm font-semibold text-blue-700">Get started</p>
              <h2 className="text-3xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-4xl">
                Create your account
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Enter your details below. Property access is assigned separately by
                your HotelCare Pro administrator.
              </p>
            </div>

            <RegisterForm />
          </div>
        </div>

        <footer className="px-5 py-6 text-center text-xs text-slate-400 sm:px-8">
          © {new Date().getFullYear()} HotelCare Pro · Secure hotel operations
        </footer>
      </section>
    </main>
  );
}
