import * as React from 'react';
import Link from 'next/link';
import { Search, RefreshCw, Home, FileText, Settings, Plus } from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';


export function AppShell({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pcms-app-shell', className)}>{children}</div>;
}

export function MobileTopBar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="pcms-section-card flex items-center justify-between gap-3 p-2.5 md:p-3">
      <div className="min-w-0 px-2">
        <p className="pcms-eyebrow">PCMS</p>
        <h2 className="truncate text-xl font-black tracking-[-0.03em] text-[var(--pcms-text)] md:text-2xl">{title}</h2>
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
  return <Link href={href} className="pcms-floating-action"><Plus className="h-5 w-5" />{label}</Link>;
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return <SkeletonList rows={rows} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="pcms-page-header">
      <div>
        <p className="pcms-eyebrow">Property Care Maintenance System</p>
        <h1>{title}</h1>
        {description ? <p className="pcms-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="pcms-page-actions">{actions}</div> : null}
    </div>
  );
}

export function WorkspaceCard({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('pcms-workspace-card', className)}>{children}</section>;
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

export function KpiWidget({ label, value, tone = 'blue', detail }: { label: string; value: React.ReactNode; tone?: 'blue' | 'violet' | 'orange' | 'green' | 'teal' | 'red'; detail?: string }) {
  return (
    <div className={cn('pcms-kpi-widget', `pcms-kpi-widget--${tone}`)}>
      <div className="pcms-kpi-widget__accent" />
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

const statusAliases: Record<string, string> = {
  pending: 'open',
  waiting_sparepart: 'waiting_spare_part',
};

export function humanize(value?: string) {
  if (!value) return 'Unassigned';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function StatusBadge({ status }: { status?: string }) {
  const normalized = statusAliases[status || ''] || status || 'open';
  return <span className={cn('pcms-status-badge', `pcms-status-badge--${normalized}`)}>{humanize(normalized)}</span>;
}

export function PriorityBadge({ priority }: { priority?: string }) {
  const normalized = priority || 'medium';
  return <span className={cn('pcms-priority-badge', `pcms-priority-badge--${normalized}`)}>{humanize(normalized)}</span>;
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
  return (
    <div className="pcms-empty-state">
      <div className="pcms-empty-state__mark" />
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function PageLoader({ label = 'Loading maintenance jobs...' }: { label?: string }) {
  return (
    <div className="pcms-page-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="pcms-loader-ring" />
      <p>{label}</p>
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="pcms-skeleton-list">
      {Array.from({ length: rows }).map((_, index) => <div key={index} className="pcms-skeleton-row" />)}
    </div>
  );
}

export function Toolbar({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between', className)}>{children}</div>;
}

export function FilterBar({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-6', className)}>{children}</div>;
}

export function ActionButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('pcms-action-button', className)} {...props}>{children}</button>;
}

export function SecondaryButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('pcms-secondary-button', className)} {...props}>{children}</button>;
}

export function DangerButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('pcms-danger-button', className)} {...props}>{children}</button>;
}

export function StatusUpdateButton({ status, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { status: string }) {
  const normalized = statusAliases[status || ''] || status || 'open';
  return <button className={cn('pcms-status-update-button', `pcms-status-update-button--${normalized}`, className)} {...props}>{children}</button>;
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs font-medium text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function DataGrid({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-hidden rounded-3xl border border-slate-200 bg-white', className)}>{children}</div>;
}

export function JobRow({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pcms-table-row-hover grid gap-3 border-b border-slate-100 p-4 md:grid-cols-8 md:items-center', className)}>{children}</div>;
}

export function JobCard({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <article className={cn('rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md', className)}>{children}</article>;
}

export function RoomPicker({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-3', className)}>{children}</div>;
}

export function PaginationControls({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <nav className={cn('flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white p-3', className)} aria-label="Pagination controls">{children}</nav>;
}
