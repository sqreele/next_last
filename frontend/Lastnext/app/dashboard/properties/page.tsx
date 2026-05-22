import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ArrowRight, Users as UsersIcon, DoorOpen } from 'lucide-react';
import { getServerSession } from '@/app/lib/session.server';
import { fetchProperties } from '@/app/lib/data.server';
import { Skeleton } from '@/app/components/ui/loading';
import { PropertiesToolbar } from './PropertiesToolbar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Properties',
  description: 'Manage hotel properties and onboard new ones in bulk.',
};

export default async function PropertiesIndexPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  const properties = (await fetchProperties(accessToken).catch(() => [])) || [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-5 sm:px-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">PCMS</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Properties
          </h1>
          <p className="text-sm font-medium text-slate-600">
            {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} in scope
          </p>
        </div>
        <PropertiesToolbar />
      </header>

      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
        }
      >
        {properties.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-900">No properties yet.</p>
            <p className="text-xs font-medium text-slate-500">
              Use Import CSV (staff only) to onboard your portfolio in one shot.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((prop: any) => (
              <li key={prop.property_id ?? prop.id}>
                <Link
                  href={`/dashboard/rooms?property=${encodeURIComponent(prop.property_id ?? prop.id)}`}
                  className="flex h-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 line-clamp-1">
                        {prop.name}
                      </p>
                      <p className="text-xs font-medium text-slate-500">
                        #{prop.property_id || prop.id}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-none text-slate-400" />
                  </div>
                  {prop.description && (
                    <p className="text-xs font-medium text-slate-600 line-clamp-2">
                      {prop.description}
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                    {typeof prop.room_count === 'number' && (
                      <span className="inline-flex items-center gap-1">
                        <DoorOpen className="h-3 w-3" /> {prop.room_count} rooms
                      </span>
                    )}
                    {typeof prop.user_count === 'number' && (
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon className="h-3 w-3" /> {prop.user_count} users
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Suspense>
    </div>
  );
}
