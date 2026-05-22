import * as React from 'react';
import Link from 'next/link';
import { Search, RefreshCw, Home, FileText, Settings, Plus } from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';
import { humanize, normalizeStatus } from '@/app/components/StatusBadge';
import { useLocale } from '@/app/lib/i18n/LocaleProvider';
import type { DictKey } from '@/app/lib/i18n/dictionary';
export { StatusBadge, getStatusBadgeConfig, humanize, normalizeStatus } from '@/app/components/StatusBadge';


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

export function SkeletonCard() {
  return (
    <div className="pcms-skeleton-card" aria-hidden="true">
      <span />
      <strong />
      <em />
    </div>
  );
}

export function normalizePriority(priority?: string) {
  const key = (priority || 'medium').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (key === 'urgent') return 'critical';
  return key;
}

const PRIORITY_I18N: Record<string, DictKey> = {
  low: 'priority.low',
  medium: 'priority.medium',
  high: 'priority.high',
  critical: 'priority.critical',
};

export function PriorityBadge({ priority }: { priority?: string }) {
  const normalized = normalizePriority(priority);
  const { t } = useLocale();
  const dictKey = PRIORITY_I18N[normalized];
  const label = dictKey ? t(dictKey) : humanize(normalized);
  return (
    <span className={cn('pcms-priority-badge', `pcms-priority-badge--${normalized}`)} title={label}>
      {label}
    </span>
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
  const normalized = normalizeStatus(status);
  return <button className={cn('pcms-status-update-button', `pcms-status-update-button--${normalized}`, className)} {...props}>{children}</button>;
}

export function FormField({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const labelClass = cn('pcms-field-label', required && 'pcms-field-label--required');
  const body = (
    <>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>{label}</label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      <div className={cn(error && 'pcms-field--invalid')}>{children}</div>
      {error ? (
        <span className="pcms-field-error" role="alert">
          <span aria-hidden="true">⚠</span>
          {error}
        </span>
      ) : hint ? (
        <span className="pcms-field-hint">{hint}</span>
      ) : null}
    </>
  );
  return htmlFor ? (
    <div className="pcms-field" data-invalid={error ? 'true' : undefined}>{body}</div>
  ) : (
    <label className="pcms-field" data-invalid={error ? 'true' : undefined}>{body}</label>
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
