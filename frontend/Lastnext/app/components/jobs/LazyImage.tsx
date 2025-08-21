'use client';
import Image from 'next/image';
import React, { useMemo } from 'react';

interface LazyImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  onError?: () => void;
  placeholder?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({ src, alt, className, onError, placeholder }) => {
  const safeSrc = useMemo(() => (typeof src === 'string' && src.length > 0 ? src : placeholder ?? null), [src, placeholder]);
  // Determine when to bypass Next.js optimization to match plain <img> behavior
  // - Relative media URLs ("/media/...") should not be optimized
  // - Absolute URLs pointing to our own domain should not be optimized
  const isRelativeMedia = typeof safeSrc === 'string' && safeSrc.startsWith('/media/');
  const isOwnDomainAbsolute = typeof safeSrc === 'string' && (
    safeSrc.startsWith('https://pcms.live') ||
    safeSrc.startsWith('https://www.pcms.live') ||
    safeSrc.startsWith('http://pcms.live') ||
    safeSrc.startsWith('http://www.pcms.live')
  );
  const shouldUnoptimize = isRelativeMedia || isOwnDomainAbsolute;

  if (!safeSrc) return <div className={className}>No image</div>;

  return (
    <Image
      src={safeSrc}
      alt={alt}
      className={className}
      width={0}
      height={0}
      sizes="100vw"
      style={{ width: '100%', height: 'auto' }}
      loading="lazy"
      unoptimized={shouldUnoptimize}
      onError={() => {
        console.error(`Failed to load image: ${safeSrc}`);
        onError?.();
      }}
    />
  );
};
