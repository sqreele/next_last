'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';

interface BulkActionsProps {
  selectedCount: number;
  onBulkDelete: () => void;
  onClear: () => void;
  isPending?: boolean;
}

const BulkActions: React.FC<BulkActionsProps> = ({ selectedCount, onBulkDelete, onClear, isPending = false }) => {
  return (
    <aside className="rounded-xl border border-primary/30 bg-primary/10 p-4 shadow-soft" aria-label="Selected maintenance actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-primary md:text-base">
          {selectedCount} item(s) selected
        </span>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            onClick={onBulkDelete}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-destructive bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground shadow-soft transition-colors hover:border-[hsl(var(--destructive-hover))] hover:bg-[hsl(var(--destructive-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={onClear}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Clear
          </button>
        </div>
      </div>
    </aside>
  );
};

export default BulkActions;
