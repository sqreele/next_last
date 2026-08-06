'use client';

import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { useSession } from '@/app/lib/session.client';
import { cn } from '@/app/lib/utils/cn';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://hotelcarepro.com');

interface PropertyExportButtonProps {
  className?: string;
  label?: string;
}

export function PropertyExportButton({ className, label }: PropertyExportButtonProps) {
  const { data: session } = useSession();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setError(null);
    const token = session?.user?.accessToken;
    if (!token) {
      setError('Sign in again to export.');
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/properties/export/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      // Pull the filename suggested by the Content-Disposition header so the
      // date stays in sync with what the server stamped.
      const cd = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || 'pcms-properties.csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Could not export properties.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        onClick={download}
        disabled={downloading}
        className="h-10 gap-2"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {label || 'Export CSV'}
      </Button>
      {error && (
        <p className="text-xs font-semibold text-rose-700">{error}</p>
      )}
    </div>
  );
}
