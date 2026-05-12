'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building, Loader2, ShieldCheck } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/api/auth/login');
  }, [router]);

  return (
    <main
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <Card className="w-full max-w-sm border-slate-200/70 shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
            <Building className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            Hotel maintenance sign in
          </CardTitle>
          <CardDescription className="text-sm">
            Property Care Maintenance System
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-8">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden />
            Redirecting to secure sign in…
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            Encrypted authentication
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
