import * as React from 'react';
import { cn } from '@/app/lib/utils/cn';
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
    <div
      className={cn(
        'flex min-h-[calc(100vh-3.5rem)] w-full items-center justify-center px-3 py-6 sm:px-6',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-none space-y-5 lg:mx-auto lg:max-w-7xl">
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="min-w-0 flex-1">
              <p className="pcms-eyebrow">HotelCare Pro</p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
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
