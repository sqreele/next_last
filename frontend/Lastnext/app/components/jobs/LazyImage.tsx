'use client';
import Image from 'next/image';
import React, { useCallback, useMemo, useRef, useState } from 'react';

interface LazyImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  onError?: () => void;
  placeholder?: string;
  fallbackSrc?: string;
  priority?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
}

const DEFAULT_FALLBACK =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04MCAxMDBDODAgODkuNTQ0IDg4LjU0NCA4MSAxMDAgODFDMTExLjQ1NiA4MSAxMjAgODkuNTQ0IDEyMCAxMDBDMTIwIDExMC40NTYgMTExLjQ1NiAxMTkgMTAwIDExOUM4OC41NDQgMTE5IDgwIDExMC40NTYgODAgMTAwWiIgZmlsbD0iIzlDQTNBRiIvPjxwYXRoIGQ9Ik0xMDAgMTMwQzExMC40NTYgMTMwIDEyMCAxMjAuNDU2IDEyMCAxMTBDMTIwIDEwOS41NDQgMTE5LjQ1NiAxMDkgMTE5IDEwOUg4MUM4MC41NDQgMTA5IDgwIDEwOS41NDQgODAgMTEwQzgwIDEyMC40NTYgODkuNTQ0IDEzMCAxMDAgMTMwWiIgZmlsbD0iIzlDQTNBRiIvPjwvc3ZnPgo=';

const MAX_RETRIES = 2;

const isOwnDomain = (s: string) =>
  s.startsWith('https://pcms.live') ||
  s.startsWith('https://www.pcms.live') ||
  s.startsWith('http://pcms.live') ||
  s.startsWith('http://www.pcms.live');

export const LazyImage: React.FC<LazyImageProps> = React.memo(function LazyImage({
  src,
  alt,
  className,
  onError,
  placeholder,
  fallbackSrc = DEFAULT_FALLBACK,
  priority = false,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  width,
  height,
}) {
  const [showFallback, setShowFallback] = useState(false);
  const retryCountRef = useRef(0);
  const [retryNonce, setRetryNonce] = useState(0);

  const safeSrc = useMemo(() => {
    if (showFallback) return fallbackSrc;
    if (typeof src === 'string' && src.length > 0) return src;
    return placeholder ?? null;
  }, [src, placeholder, fallbackSrc, showFallback]);

  const shouldUnoptimize = useMemo(() => {
    if (typeof safeSrc !== 'string') return false;
    return safeSrc.startsWith('/media/') || isOwnDomain(safeSrc);
  }, [safeSrc]);

  const handleError = useCallback(() => {
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      setRetryNonce((n) => n + 1);
      return;
    }
    setShowFallback(true);
    onError?.();
  }, [onError]);

  if (!safeSrc) {
    return (
      <div
        className={`${className ?? ''} bg-gray-200 flex items-center justify-center text-gray-500 text-sm`}
      >
        No image
      </div>
    );
  }

  const useIntrinsic = width != null && height != null;
  const cacheBustedSrc =
    retryNonce > 0 && !showFallback && typeof safeSrc === 'string'
      ? `${safeSrc}${safeSrc.includes('?') ? '&' : '?'}_r=${retryNonce}`
      : safeSrc;

  return (
    <Image
      key={showFallback ? 'fallback' : 'primary'}
      src={cacheBustedSrc}
      alt={showFallback ? `${alt} (fallback)` : alt}
      className={className}
      width={useIntrinsic ? width : 0}
      height={useIntrinsic ? height : 0}
      sizes={sizes}
      style={useIntrinsic ? undefined : { width: '100%', height: 'auto' }}
      loading={priority ? undefined : 'lazy'}
      priority={priority}
      unoptimized={shouldUnoptimize || showFallback}
      onError={handleError}
    />
  );
});
