'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, RefreshCw, Home, FileText, Settings, Plus } from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';
import { FeedbackState } from '@/app/components/feedback/FeedbackState';
export { StatusBadge, getStatusBadgeConfig, humanize, normalizeStatus } from '@/app/components/StatusBadge';
export { PriorityBadge, normalizePriority } from '@/app/components/PriorityBadge';

export function MobileTopBar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="pcms-section-card flex items-center justify-between gap-3 p-2.5 md:p-3">
      <div className="min-w-0 px-2">
        <p className="pcms-eyebrow">StayMaint</p>
        <h2 className="truncate text-xl font-bold text-[var(--pcms-text)] md:text-2xl">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions || (
          <>
            <Link href="/dashboard" className="pcms-secondary-button h-11 w-11 p-0" aria-label="Dashboard"><Home className="h-4 w-4" /></Link>
            <button className="pcms-secondary-button h-11 w-11 p-0" type="button" aria-label="Refresh" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /></button>
            <Link href="/dashboard/jobs-report" className="pcms-secondary-button h-11 w-11 p-0" aria-label="PDF Report"><FileText className="h-4 w-4" /></Link>
            <Link href="/dashboard/profile" className="pcms-secondary-button h-11 w-11 p-0" aria-label="Settings"><Settings className="h-4 w-4" /></Link>
          </>
        )}
      </div>
    </div>
  );
}

export function FloatingActionButton({ href = '/dashboard/create-job', label = 'Create Job' }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="pcms-floating-action" aria-label={label}>
      <Plus className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return <SkeletonList rows={rows} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="pcms-page-header">
      <div>
        <p className="pcms-eyebrow">Smart Hotel Maintenance and Engineering Management Software</p>
        <h1>{title}</h1>
        {description ? <p className="pcms-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="pcms-page-actions">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({ title, description, children, className }: React.HTMLAttributes<HTMLDivElement> & { title?: string; description?: string }) {
  return (
    <section className={cn('pcms-section-card', className)}>
      {(title || description) && (
        <div className="pcms-section-card__header">
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function SkeletonCard() {
  return (
    <div className="pcms-skeleton-card" aria-hidden="true">
      <span />
      <strong />
      <em />
    </div>
  );
}

export function SearchInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('pcms-search-input', className)}>
      <Search aria-hidden className="h-4 w-4" />
      <input {...props} type={props.type || 'search'} />
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <FeedbackState title={title} description={description} action={action} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="pcms-skeleton-list">
      {Array.from({ length: rows }).map((_, index) => <div key={index} className="pcms-skeleton-row" />)}
    </div>
  );
}
