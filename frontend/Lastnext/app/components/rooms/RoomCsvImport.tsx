'use client';

import React from 'react';
import { CsvImportDialog, type CsvImportResult } from '@/app/components/import/CsvImportDialog';

interface RoomCsvImportProps {
  currentPropertyId?: string | null;
  onImported?: (result: CsvImportResult) => void;
  className?: string;
}

export function RoomCsvImport({ currentPropertyId, onImported, className }: RoomCsvImportProps) {
  return (
    <CsvImportDialog
      label="rooms"
      description={
        'Upload a CSV with columns: name (required), room_type, is_active, property_id. ' +
        'Existing rooms with the same name get re-attached to the property instead of duplicated.'
      }
      importPath="/api/v1/rooms/bulk-import/"
      templatePath="/api/v1/rooms/import-template/"
      templateFilename="pcms-rooms-template.csv"
      currentPropertyId={currentPropertyId}
      onImported={onImported}
      className={className}
    />
  );
}
