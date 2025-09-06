"use client";

import React, { useState } from 'react';
import Image from 'next/image';

interface ImageDebugProps {
  src: string;
  alt: string;
  className?: string;
}

export function ImageDebug({ src, alt, className }: ImageDebugProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const handleLoad = () => {
    setStatus('loaded');
    setError(null);
  };

  const handleError = (e: any) => {
    setStatus('error');
    setError(e.message || 'Unknown error');
  };

  return (
    <div className={`relative ${className}`}>
      <div className="absolute top-0 left-0 z-10 bg-black bg-opacity-75 text-white text-xs p-1 rounded">
        {status === 'loading' && 'Loading...'}
        {status === 'loaded' && '✓ Loaded'}
        {status === 'error' && `✗ Error: ${error}`}
      </div>
      <div className="absolute top-0 right-0 z-10 bg-black bg-opacity-75 text-white text-xs p-1 rounded">
        {src}
      </div>
      <Image
        src={src}
        alt={alt}
        width={400}
        height={300}
        className="w-full h-auto"
        onLoad={handleLoad}
        onError={handleError}
        unoptimized={src.startsWith('/media/') || src.startsWith('http://') || src.startsWith('https://')}
      />
    </div>
  );
}
