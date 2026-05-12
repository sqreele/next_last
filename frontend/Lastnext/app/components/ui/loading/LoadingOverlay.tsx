import * as React from 'react';
import { cn } from '@/app/lib/utils/cn';
import { Spinner } from './Spinner';

export function LoadingOverlay({ show, label = 'Loading...', className }: { show: boolean; label?: string; className?: string }) {
  if (!show) return null;
  return (
    <div className={cn('absolute inset-0 z-20 grid place-items-center rounded-inherit bg-white/70 p-4 backdrop-blur-sm', className)} role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg">
        <Spinner size="sm" className="text-cyan-600" />
        {label}
      </div>
    </div>
  );
}
