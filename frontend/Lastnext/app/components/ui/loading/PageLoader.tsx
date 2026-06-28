import * as React from 'react';
import { Hotel, Wrench } from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';
import { Spinner } from './Spinner';
import { SkeletonCard, SkeletonList } from './Skeleton';

export function PageLoader({
  label = 'Preparing your maintenance workspace...',
  description = 'Loading hotel operations data securely.',
  className,
}: {
  label?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-h-[60vh] w-full px-3 py-6 sm:px-6', className)} role="status" aria-live="polite" aria-busy="true">
      <div className="w-full max-w-none space-y-5 lg:mx-auto lg:max-w-7xl">
        <div className="rounded-[18px] border border-[var(--pcms-border)] bg-white/90 p-5 shadow-[var(--pcms-shadow-sm)] backdrop-blur sm:p-6">
          <div className="flex items-center gap-4">
            <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-[var(--pcms-primary)] text-white shadow-[var(--pcms-shadow-sm)]">
              <Hotel className="h-7 w-7" />
              <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-white text-cyan-600 shadow-sm">
                <Wrench className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="pcms-eyebrow">PCMS</p>
              <h1 className="text-xl font-bold text-[var(--pcms-text)] sm:text-2xl">{label}</h1>
              <p className="mt-1 text-sm font-semibold text-[var(--pcms-text-muted)]">{description}</p>
            </div>
            <Spinner className="hidden text-cyan-600 sm:inline-block" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
        </div>
        <SkeletonList rows={4} />
      </div>
    </div>
  );
}
