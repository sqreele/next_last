'use client';

import React from 'react';
import { CsvImportDialog, type CsvImportResult } from '@/app/components/import/CsvImportDialog';

interface PropertyCsvImportProps {
  onImported?: (result: CsvImportResult) => void;
  className?: string;
}

export function PropertyCsvImport({ onImported, className }: PropertyCsvImportProps) {
  return (
    <CsvImportDialog
      label="properties"
      description={
        'Upload a CSV with columns: name (required), property_id (optional — auto-generated when blank), ' +
        'description. Each imported property is auto-attached to your user. Staff/superuser only.'
      }
      importPath="/api/v1/properties/bulk-import/"
      templatePath="/api/v1/properties/import-template/"
      templateFilename="pcms-properties-template.csv"
      onImported={onImported}
      className={className}
    />
  );
}
