'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Maximize2,
  X,
  Columns2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Image from 'next/image';
import { JobImage } from '@/app/lib/types';
import { fixImageUrl } from '@/app/lib/utils/image-utils';
import { cn } from '@/app/lib/utils/cn';

interface BeforeAfterCompareProps {
  images?: JobImage[];
  /** Fallback for legacy `image_urls` arrays without timestamps. */
  imageUrls?: string[];
  /** Job creation timestamp — anything uploaded within 1h is treated as "before". */
  createdAt?: string;
  /** Completion timestamp — anything uploaded within 1h of (or after) this is "after". */
  completedAt?: string | null;
  /** Force one mode regardless of viewport */
  defaultMode?: 'side-by-side' | 'slider';
  className?: string;
}

interface ClassifiedImage {
  url: string;
  uploadedAt: string | null;
  kind: 'before' | 'after';
}

function classifyImages(
  images: JobImage[] | undefined,
  imageUrls: string[] | undefined,
  createdAt?: string,
  completedAt?: string | null,
): { before: ClassifiedImage[]; after: ClassifiedImage[] } {
  const before: ClassifiedImage[] = [];
  const after: ClassifiedImage[] = [];
  const created = createdAt ? new Date(createdAt).getTime() : null;
  const completed = completedAt ? new Date(completedAt).getTime() : null;
  const HOUR = 60 * 60 * 1000;

  if (images && images.length) {
    images.forEach((img) => {
      const raw = img.jpeg_url || img.image_url;
      const url = fixImageUrl(raw) || raw;
      if (!url) return;
      const uploadedAt = img.uploaded_at || null;
      const uploadedMs = uploadedAt ? new Date(uploadedAt).getTime() : null;

      let kind: 'before' | 'after' = 'before';
      if (uploadedMs !== null) {
        if (completed !== null && uploadedMs >= completed - HOUR) {
          kind = 'after';
        } else if (created !== null && uploadedMs <= created + HOUR) {
          kind = 'before';
        } else if (completed !== null && uploadedMs >= completed) {
          kind = 'after';
        } else {
          kind = completed !== null && uploadedMs > (created ?? 0) + HOUR ? 'after' : 'before';
        }
      } else {
        // No timestamp: first image is before, others stay before too.
        kind = 'before';
      }
      (kind === 'before' ? before : after).push({ url, uploadedAt, kind });
    });
  }

  if (!images?.length && imageUrls?.length) {
    // Legacy: split in half — first ones before, last ones after, assuming chronological upload order.
    const mid = Math.ceil(imageUrls.length / 2);
    imageUrls.forEach((raw, index) => {
      const url = fixImageUrl(raw) || raw;
      if (!url) return;
      const kind: 'before' | 'after' = index < mid ? 'before' : 'after';
      (kind === 'before' ? before : after).push({ url, uploadedAt: null, kind });
    });
    // If only one image total, treat as "before"
    if (imageUrls.length === 1) {
      // already in `before`
    }
  }

  // De-duplicate URLs
  const dedupe = (arr: ClassifiedImage[]) => {
    const seen = new Set<string>();
    return arr.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  };
  return { before: dedupe(before), after: dedupe(after) };
}

function Lightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/30"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="relative h-full max-h-[90vh] w-full max-w-5xl">
        <Image
          src={url}
          alt={alt}
          fill
          className="object-contain"
          quality={90}
          unoptimized={url.startsWith('http')}
          sizes="100vw"
        />
      </div>
    </div>
  );
}

function SliderCompare({
  before,
  after,
}: {
  before: ClassifiedImage;
  after: ClassifiedImage;
}) {
  const [percent, setPercent] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const updateFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPercent(Math.max(0, Math.min(100, next)));
  };

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 select-none touch-none"
      onMouseDown={(event) => {
        dragging.current = true;
        updateFromClientX(event.clientX);
      }}
      onMouseMove={(event) => {
        if (!dragging.current) return;
        updateFromClientX(event.clientX);
      }}
      onMouseUp={() => {
        dragging.current = false;
      }}
      onMouseLeave={() => {
        dragging.current = false;
      }}
      onTouchStart={(event) => {
        dragging.current = true;
        updateFromClientX(event.touches[0].clientX);
      }}
      onTouchMove={(event) => {
        if (!dragging.current) return;
        updateFromClientX(event.touches[0].clientX);
      }}
      onTouchEnd={() => {
        dragging.current = false;
      }}
    >
      <Image
        src={after.url}
        alt="After"
        fill
        className="object-cover"
        unoptimized={after.url.startsWith('http')}
        sizes="(max-width: 768px) 100vw, 800px"
      />
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${percent}%` }}
      >
        <div className="relative h-full w-screen max-w-none" style={{ width: containerRef.current?.clientWidth || '100%' }}>
          <Image
            src={before.url}
            alt="Before"
            fill
            className="object-cover"
            unoptimized={before.url.startsWith('http')}
            sizes="(max-width: 768px) 100vw, 800px"
          />
        </div>
      </div>
      <div
        className="absolute inset-y-0 flex w-1 -translate-x-1/2 cursor-ew-resize items-center justify-center bg-white shadow-lg"
        style={{ left: `${percent}%` }}
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-md ring-2 ring-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-slate-900" />
        </span>
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow">
        Before
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow">
        After
      </span>
    </div>
  );
}

function SideCard({
  image,
  label,
  color,
  onZoom,
  count,
  total,
  onPrev,
  onNext,
}: {
  image: ClassifiedImage;
  label: string;
  color: 'rose' | 'emerald';
  onZoom: () => void;
  count: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const colorClass =
    color === 'rose'
      ? 'bg-rose-600'
      : 'bg-emerald-600';
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <Image
        src={image.url}
        alt={`${label} photo ${count} of ${total}`}
        fill
        className="object-cover"
        unoptimized={image.url.startsWith('http')}
        sizes="(max-width: 768px) 100vw, 50vw"
      />
      <span
        className={cn(
          'absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow',
          colorClass,
        )}
      >
        {label}
      </span>
      {total > 1 && (
        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white shadow">
          {count}/{total}
        </span>
      )}
      <button
        type="button"
        onClick={onZoom}
        aria-label="Open fullscreen"
        className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-900 shadow hover:bg-white"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous"
            className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-900 shadow hover:bg-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-900 shadow hover:bg-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

export function BeforeAfterCompare({
  images,
  imageUrls,
  createdAt,
  completedAt,
  defaultMode = 'side-by-side',
  className,
}: BeforeAfterCompareProps) {
  const { before, after } = useMemo(
    () => classifyImages(images, imageUrls, createdAt, completedAt),
    [images, imageUrls, createdAt, completedAt],
  );
  const [mode, setMode] = useState<'side-by-side' | 'slider'>(defaultMode);
  const [beforeIdx, setBeforeIdx] = useState(0);
  const [afterIdx, setAfterIdx] = useState(0);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);

  if (!before.length && !after.length) {
    return null;
  }

  const currentBefore = before[beforeIdx % Math.max(before.length, 1)];
  const currentAfter = after[afterIdx % Math.max(after.length, 1)];

  const canSlider = before.length > 0 && after.length > 0;
  const hasSingleImageGroup = before.length === 0 || after.length === 0;

  return (
    <section className={cn('space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
            <Camera className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">Before / After</h3>
            <p className="text-xs font-medium text-slate-500">
              {before.length} before · {after.length} after
              {!after.length && ' (waiting on completion photo)'}
            </p>
          </div>
        </div>

        {canSlider && (
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode('side-by-side')}
              aria-pressed={mode === 'side-by-side'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 transition-colors',
                mode === 'side-by-side' ? 'bg-white text-slate-900 shadow' : 'text-slate-600',
              )}
            >
              <Columns2 className="h-3.5 w-3.5" />
              Side-by-side
            </button>
            <button
              type="button"
              onClick={() => setMode('slider')}
              aria-pressed={mode === 'slider'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 transition-colors',
                mode === 'slider' ? 'bg-white text-slate-900 shadow' : 'text-slate-600',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Slider
            </button>
          </div>
        )}
      </div>

      {canSlider && mode === 'slider' ? (
        <SliderCompare before={currentBefore} after={currentAfter} />
      ) : (
        <div
          className={cn(
            'grid gap-3',
            hasSingleImageGroup ? 'grid-cols-1' : 'sm:grid-cols-2',
          )}
        >
          {before.length > 0 && (
            <SideCard
              image={currentBefore}
              label="Before"
              color="rose"
              count={beforeIdx + 1}
              total={before.length}
              onZoom={() => setLightbox({ url: currentBefore.url, alt: 'Before photo' })}
              onPrev={() => setBeforeIdx((i) => (i - 1 + before.length) % before.length)}
              onNext={() => setBeforeIdx((i) => (i + 1) % before.length)}
            />
          )}
          {after.length > 0 ? (
            <SideCard
              image={currentAfter}
              label="After"
              color="emerald"
              count={afterIdx + 1}
              total={after.length}
              onZoom={() => setLightbox({ url: currentAfter.url, alt: 'After photo' })}
              onPrev={() => setAfterIdx((i) => (i - 1 + after.length) % after.length)}
              onNext={() => setAfterIdx((i) => (i + 1) % after.length)}
            />
          ) : (
            <div className="grid aspect-video place-items-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-700">
              <div>
                <CheckCircle2 className="mx-auto mb-1 h-6 w-6" />
                <p>Upload an after photo when the job is completed.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {(before.length > 1 || after.length > 1) && mode === 'side-by-side' && (
        <div className="grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
          {before.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {before.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setBeforeIdx(i)}
                  aria-label={`Show before photo ${i + 1}`}
                  className={cn(
                    'h-2.5 w-6 rounded-full transition-colors',
                    i === beforeIdx ? 'bg-rose-600' : 'bg-slate-300 hover:bg-slate-400',
                  )}
                />
              ))}
            </div>
          )}
          {after.length > 1 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {after.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAfterIdx(i)}
                  aria-label={`Show after photo ${i + 1}`}
                  className={cn(
                    'h-2.5 w-6 rounded-full transition-colors',
                    i === afterIdx ? 'bg-emerald-600' : 'bg-slate-300 hover:bg-slate-400',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <Lightbox url={lightbox.url} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}
