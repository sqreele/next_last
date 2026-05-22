import * as React from 'react';
import { cn } from '@/app/lib/utils/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%]', className)}
      {...props}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-[var(--pcms-radius-lg)] border border-slate-200 bg-white p-4 shadow-[var(--pcms-shadow-sm)]', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-9 w-20" />
      <Skeleton className="mt-3 h-3 w-36" />
    </div>
  );
}

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-[var(--pcms-radius)] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[var(--pcms-radius-lg)] border border-slate-200 bg-white shadow-sm', className)}>
      <div className="hidden grid-cols-5 gap-4 border-b border-slate-100 bg-slate-50 p-4 md:grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => <Skeleton key={index} className="h-3 w-20" />)}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-5 md:gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton key={columnIndex} className={cn('h-4', columnIndex === 0 ? 'w-28' : 'w-full')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function JobCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      <div className="absolute left-0 top-0 h-full w-1.5 bg-slate-200" />
      <div className="space-y-3 border-b border-slate-100 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        <Skeleton className="aspect-video w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function JobListSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <JobCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function DashboardKpiSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <Skeleton className="mt-4 h-8 w-24" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function DetailPageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('mx-auto max-w-4xl space-y-5', className)}>
      <div className="pcms-page-header">
        <div className="w-full space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>
      <div className="pcms-section-card space-y-5 p-5 sm:p-6">
        <Skeleton className="h-56 w-full rounded-3xl" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
