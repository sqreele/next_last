'use client';
import { BouncingDotsLoader } from '@/app/components/ui/BouncingDotsLoader';

import { getRoomPropertyId } from '@/app/lib/utils/property-filter';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Printer, ArrowLeft, Download } from 'lucide-react';
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

function getImageDedupeKey(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0];
  let pathname: string;

  try {
    pathname = new URL(withoutQuery, 'https://pcms.local').pathname;
  } catch {
    pathname = withoutQuery.replace(/^https?:\/\/[^/]+/i, '');
  }

  const normalizedPath = decodeURIComponent(pathname)
    .replace(/\\/g, '/')
    .replace(/^\/media\/(?:media\/)+/i, '/media/')
    .toLowerCase();

  // The API can expose the same uploaded photo twice: once as the original
  // image URL and once as its generated JPEG URL. Those URLs only differ by
  // extension, so compare media paths by their base filename.
  if (normalizedPath.startsWith('/media/maintenance_job_images/')) {
    return normalizedPath.replace(/\.(?:jpe?g|png|gif|webp)$/i, '');
  }

  return normalizedPath;
}

function getPrintableImageUrls(job: Job): { displayUrls: string[]; totalCount: number } {
  const seen = new Set<string>();
  const urls: string[] = [];

  const addUrl = (rawUrl: string | null | undefined) => {
    const normalizedUrl = fixImageUrl(rawUrl) || rawUrl?.trim();
    if (!normalizedUrl) return;

    const key = getImageDedupeKey(normalizedUrl);
    if (seen.has(key)) return;

    seen.add(key);
    urls.push(normalizedUrl);
  };

  job.images?.forEach((image) => addUrl(image.jpeg_url || image.image_url));
  job.image_urls?.forEach(addUrl);

  return {
    displayUrls: urls.slice(0, MAX_PRINTABLE_PHOTOS),
    totalCount: urls.length,
  };
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

/**
 * html2canvas 1.x cannot parse the oklab/oklch values emitted by Tailwind 4.
 * Browsers can render those colors, so resolve them to sRGB in html2canvas's
 * cloned document without changing the work order shown on screen.
 */
function applyPdfColorFallbacks(clonedDocument: Document) {
  const clonedWindow = clonedDocument.defaultView;
  const colorContext = clonedDocument
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  const root = clonedDocument.querySelector<HTMLElement>('[data-work-order-pdf-content]');
  if (!clonedWindow || !colorContext || !root) return;

  // html2canvas also inspects generated pseudo-elements. They are not used by
  // the work-order content, and Tailwind can give them inherited oklch colors.
  const pseudoElementReset = clonedDocument.createElement('style');
  pseudoElementReset.textContent = `
    [data-work-order-pdf-content]::before,
    [data-work-order-pdf-content]::after,
    [data-work-order-pdf-content] *::before,
    [data-work-order-pdf-content] *::after {
      content: none !important;
      background: none !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }
  `;
  clonedDocument.head.appendChild(pseudoElementReset);

  const colorProperties = [
    'color',
    'background-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'outline-color',
    'text-decoration-color',
    'column-rule-color',
    'caret-color',
    'fill',
    'stroke',
  ];
  const unsupportedColor = /(?:oklab|oklch|color-mix)\(/i;
  const toSrgb = (color: string) => {
    try {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = color;
      colorContext.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
      return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
    } catch {
      return null;
    }
  };

  [root, ...root.querySelectorAll<HTMLElement>('*')].forEach((element) => {
    const computedStyle = clonedWindow.getComputedStyle(element);
    colorProperties.forEach((property) => {
      const color = computedStyle.getPropertyValue(property);
      if (!unsupportedColor.test(color)) return;
      const srgbColor = toSrgb(color);
      if (srgbColor) element.style.setProperty(property, srgbColor, 'important');
    });

    // html2canvas also parses colors inside these compound properties. None
    // are essential to the printable document, so omit unsupported effects.
    ['box-shadow', 'text-shadow', 'background-image', 'filter'].forEach((property) => {
      if (unsupportedColor.test(computedStyle.getPropertyValue(property))) {
        element.style.setProperty(property, 'none', 'important');
      }
    });

    // Tailwind may emit oklch in less common properties as its generated CSS
    // evolves. Sanitize every remaining computed property instead of relying
    // on a fixed allow-list. Custom properties are harmless to html2canvas;
    // their resolved consuming property has already been handled above.
    for (let index = 0; index < computedStyle.length; index += 1) {
      const property = computedStyle.item(index);
      if (!property || property.startsWith('--') || colorProperties.includes(property)) continue;

      const value = computedStyle.getPropertyValue(property);
      if (!unsupportedColor.test(value)) continue;

      if (property.endsWith('-color')) {
        const srgbColor = toSrgb(value);
        element.style.setProperty(property, srgbColor ?? 'transparent', 'important');
      } else {
        // Effects and gradients are cosmetic in the printable work order.
        // Resetting an unsupported value is safer than letting html2canvas's
        // CSS parser abort the complete export.
        element.style.setProperty(property, 'initial', 'important');
      }
    }
  });
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
    const roomPropertyId = room ? getRoomPropertyId(room) : null;
    const property = properties.find(
      (p) =>
        roomPropertyId != null &&
        (String(roomPropertyId) === String(p.property_id) ||
          String(roomPropertyId) === String(p.id)),
    );
    if (room?.room_id && property?.property_id) {
      return `${origin}/report/${property.property_id}/${room.room_id}`;
    }
    return `${origin}/dashboard/jobs/${job.job_id}`;
  }, [job.job_id, job.rooms, properties]);

  const propertyName = getPropertyName(job, properties);
  const { displayUrls: imageUrls, totalCount: imageCount } = getPrintableImageUrls(job);
  const roomLine =
    job.rooms?.map((r) => `${r.name || `Room ${r.room_id}`}${r.room_type ? ` (${r.room_type})` : ''}`).join(', ') ||
    job.room_name ||
    '—';

  const handleDownloadPdf = async () => {
    const printableContent = printableContentRef.current;
    if (!printableContent || isDownloadingPdf) return;

    setIsDownloadingPdf(true);
    setPdfError(null);
    let exportStage = 'loading the PDF tools';
    try {
      await waitForImages(printableContent);
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      exportStage = 'rendering the work order';
      const canvas = await html2canvas(printableContent, {
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: applyPdfColorFallbacks,
      });

      if (!canvas.width || !canvas.height) {
        throw new Error('The rendered work order is empty.');
      }

      exportStage = 'building the PDF pages';
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const targetWidth = pageWidth - margin * 2;
      const targetHeight = pageHeight - margin * 2;
      const pixelsPerMillimeter = canvas.width / targetWidth;
      const pageCanvasHeight = Math.max(1, Math.floor(targetHeight * pixelsPerMillimeter));
      let sourceY = 0;
      let pageIndex = 0;

      // Slice the tall render into page-sized canvases. Adding the entire PNG
      // repeatedly for every page uses considerably more memory and commonly
      // fails in mobile browsers.
      while (sourceY < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const pageContext = pageCanvas.getContext('2d');
        if (!pageContext) {
          throw new Error('Could not create a canvas for a PDF page.');
        }

        pageContext.fillStyle = '#ffffff';
        pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageContext.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );

        const imageData = pageCanvas.toDataURL('image/jpeg', 0.9);
        if (imageData === 'data:,') {
          throw new Error('The browser could not encode a PDF page image.');
        }

        if (pageIndex > 0) pdf.addPage();
        const renderedSliceHeight = sliceHeight / pixelsPerMillimeter;
        pdf.addImage(
          imageData,
          'JPEG',
          margin,
          margin,
          targetWidth,
          renderedSliceHeight,
          undefined,
          'FAST',
        );

        sourceY += sliceHeight;
        pageIndex += 1;
      }

      exportStage = 'saving the PDF file';
      pdf.save(buildPdfFilename(job.job_id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`Failed to download work order PDF while ${exportStage}:`, error);
      setPdfError(`Could not download PDF while ${exportStage}: ${reason}`);
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
              <BouncingDotsLoader size="sm" />
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

      <div
        ref={printableContentRef}
        data-work-order-pdf-content
        className="bg-white px-4 py-6 sm:px-10 sm:py-8"
      >
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

        <section className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 sm:gap-4">
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
              {imageCount > MAX_PRINTABLE_PHOTOS
                ? `Total photos in this job: ${imageCount} · Showing first ${MAX_PRINTABLE_PHOTOS}`
                : `Total photos in this job: ${imageCount}`}
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
              <QRCode value={qrValue} size={104} aria-label="Open this job in StayMaint" />
            </div>
            <p className="max-w-[7rem] text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Scan to open in StayMaint
            </p>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] font-medium text-slate-500">
          Printed {new Date().toLocaleString()} · StayMaint Hotel Maintenance
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
