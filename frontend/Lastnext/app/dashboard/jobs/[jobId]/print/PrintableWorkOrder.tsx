'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Printer, ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Job, Property } from '@/app/lib/types';
import { Button } from '@/app/components/ui/button';
import { StatusBadge, PriorityBadge } from '@/app/components/pcms-ui';
import { getDisplayName } from '@/app/lib/utils/display-name';
import { fixImageUrl } from '@/app/lib/utils/image-utils';

interface PrintableWorkOrderProps {
  job: Job;
  properties: Property[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MAX_PRINTABLE_PHOTOS = 6;

function getPrintableImageUrls(job: Job): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  const addUrl = (rawUrl: string | null | undefined) => {
    const normalizedUrl = fixImageUrl(rawUrl) || rawUrl?.trim();
    if (!normalizedUrl || seen.has(normalizedUrl)) return;
    seen.add(normalizedUrl);
    urls.push(normalizedUrl);
  };

  job.images?.forEach((image) => addUrl(image.jpeg_url || image.image_url));
  job.image_urls?.forEach(addUrl);

  return urls.slice(0, MAX_PRINTABLE_PHOTOS);
}

function getPropertyName(job: Job, properties: Property[]): string {
  const lookup = (id: unknown): string | null => {
    if (id == null) return null;
    const key =
      typeof id === 'object' && id
        ? String((id as { property_id?: string; id?: string }).property_id ?? (id as { id?: string }).id ?? '')
        : String(id);
    if (!key) return null;
    const found = properties.find((p) => String(p.property_id) === key || String(p.id) === key);
    return found?.name ?? null;
  };
  return (
    lookup(job.property_id) ??
    (job.properties?.map(lookup).filter(Boolean).join(', ') as string | undefined) ??
    '—'
  );
}

function buildPdfFilename(jobId: string | undefined): string {
  const safeJobId = String(jobId || 'work-order').replace(/[^a-z0-9_-]+/gi, '-');
  const date = new Date().toISOString().slice(0, 10);
  return `work-order-${safeJobId}-${date}.pdf`;
}

async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
    }),
  );
}

export function PrintableWorkOrder({ job, properties }: PrintableWorkOrderProps) {
  const printableContentRef = useRef<HTMLDivElement | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Auto-trigger the browser's print dialog when ?auto=1 is present so we
  // can deep-link "Print" buttons that go straight to paper.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto') === '1') {
      const t = window.setTimeout(() => window.print(), 350);
      return () => window.clearTimeout(t);
    }
  }, []);

  // QR points to the staff view by default. If a guest-facing URL makes
  // sense for the room (i.e. there is a room attached to this job), prefer
  // the public report endpoint so a guest who picks up the slip still lands
  // somewhere useful instead of an auth wall.
  const qrValue = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const room = job.rooms?.[0];
    const property = properties.find(
      (p) =>
        room?.properties?.some(
          (rp) =>
            (typeof rp === 'object' && rp && 'property_id' in rp
              ? String((rp as { property_id?: string }).property_id) === String(p.property_id)
              : String(rp) === String(p.property_id) || String(rp) === String(p.id)),
        ),
    );
    if (room?.room_id && property?.property_id) {
      return `${origin}/report/${property.property_id}/${room.room_id}`;
    }
    return `${origin}/dashboard/jobs/${job.job_id}`;
  }, [job.job_id, job.rooms, properties]);

  const propertyName = getPropertyName(job, properties);
  const imageUrls = getPrintableImageUrls(job);
  const roomLine =
    job.rooms?.map((r) => `${r.name || `Room ${r.room_id}`}${r.room_type ? ` (${r.room_type})` : ''}`).join(', ') ||
    job.room_name ||
    '—';

  const handleDownloadPdf = async () => {
    const printableContent = printableContentRef.current;
    if (!printableContent || isDownloadingPdf) return;

    setIsDownloadingPdf(true);
    setPdfError(null);
    try {
      await waitForImages(printableContent);
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(printableContent, {
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const targetWidth = pageWidth - margin * 2;
      const renderedHeight = (canvas.height * targetWidth) / canvas.width;
      let heightLeft = renderedHeight;
      let position = margin;

      pdf.addImage(imageData, 'PNG', margin, position, targetWidth, renderedHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = heightLeft - renderedHeight + margin;
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', margin, position, targetWidth, renderedHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      pdf.save(buildPdfFilename(job.job_id));
    } catch (error) {
      console.error('Failed to download work order PDF:', error);
      setPdfError('Could not download PDF. Please try Print instead.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="print-work-order mx-auto max-w-3xl bg-white text-slate-900">
      {/* Print-only stylesheet keeps the on-screen layout intact for review. */}
      <style jsx global>{`
        @media print {
          /* Hide the surrounding dashboard chrome by default. The page is
             served inside /dashboard so the layout decorations are still
             rendered; we just hide them on print. */
          body > * { visibility: hidden; }
          .print-work-order, .print-work-order * { visibility: visible; }
          .print-work-order { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-image-card { break-inside: avoid; page-break-inside: avoid; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="h-9"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <p className="text-sm font-bold text-slate-700">
          Printable work order · #{job.job_id}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isDownloadingPdf ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            PDF
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => window.print()}
            className="h-9 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Printer className="mr-1 h-4 w-4" /> Print
          </Button>
        </div>
      </div>
      {pdfError && (
        <div className="no-print border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {pdfError}
        </div>
      )}

      <div ref={printableContentRef} className="bg-white px-8 py-8 sm:px-10">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">
              Maintenance work order
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              #{job.job_id}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {propertyName} · {roomLine}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={job.status} />
            <PriorityBadge priority={job.priority} />
            {job.is_preventivemaintenance && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                Preventive maintenance
              </span>
            )}
          </div>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-4 text-sm">
          <Field label="Topic">{job.topics?.[0]?.title || '—'}</Field>
          <Field label="Assigned to">
            {getDisplayName(job.user, job.technician_name || job.user_name || '—')}
          </Field>
          <Field label="Area">{job.area?.name || job.area_name || '—'}</Field>
          <Field label="Created">{formatDate(job.created_at)}</Field>
          <Field label="Updated">{formatDate(job.updated_at)}</Field>
          <Field label="Completed">{formatDate(job.completed_at)}</Field>
        </section>

        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Description
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-900">
            {job.description || '—'}
          </p>
        </section>

        {job.remarks && (
          <section className="mt-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Remarks
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {job.remarks}
            </p>
          </section>
        )}


        {imageUrls.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Photos
            </h2>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Showing up to {MAX_PRINTABLE_PHOTOS} photos
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {imageUrls.map((imageUrl, index) => (
                <figure
                  key={`${imageUrl}-${index}`}
                  className="print-image-card overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                >
                  {/* Use a plain img so browser print keeps Django/media URLs intact. */}
                  <img
                    src={imageUrl}
                    alt={`Job photo ${index + 1} for ${job.job_id}`}
                    className="h-32 w-full object-cover"
                  />
                  <figcaption className="border-t border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Photo {index + 1}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 grid grid-cols-[1fr_auto] items-end gap-6 border-t border-slate-200 pt-5">
          <div className="space-y-6">
            <SignatureBlock label="Technician signature" />
            <SignatureBlock label="Verified by" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-md border border-slate-300 bg-white p-2">
              <QRCode value={qrValue} size={104} aria-label="Open this job in PCMS" />
            </div>
            <p className="max-w-[7rem] text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Scan to open in PCMS
            </p>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] font-medium text-slate-500">
          Printed {new Date().toLocaleString()} · PCMS Hotel Maintenance
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-900">{children}</p>
    </div>
  );
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div>
      <div className="h-12 border-b border-slate-400" />
      <div className="mt-1 flex items-baseline justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <span>{label}</span>
        <span>Date</span>
      </div>
    </div>
  );
}
