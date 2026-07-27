'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';

interface BulkActionsProps {
  selectedCount: number;
  onBulkDelete: () => void;
  onClear: () => void;
}

const BulkActions: React.FC<BulkActionsProps> = ({ selectedCount, onBulkDelete, onClear }) => {
  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 md:mb-6 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-blue-700 text-sm md:text-base font-medium">
          {selectedCount} item(s) selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={onBulkDelete}
            className="min-h-11 rounded-lg bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4 inline mr-1" />
            Delete
          </button>
          <button
            onClick={onClear}
            className="min-h-11 rounded-lg bg-gray-600 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkActions;
