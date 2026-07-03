import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/app/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Unauthorized property access</h1>
        <p className="mt-3 text-sm text-gray-600">
          Your account is not assigned to this property. Please use a property assigned to your profile or contact an administrator.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
