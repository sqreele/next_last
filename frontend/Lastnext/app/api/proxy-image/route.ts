import sharp from 'sharp';

export const dynamic = 'force-dynamic';

// Allowed URL patterns for SSRF protection
const ALLOWED_URL_PATTERNS = [
  // Production domains
  /^https:\/\/pcms\.live\//,
  /^https:\/\/www\.pcms\.live\//,
  // Development/Docker
  /^http:\/\/localhost(:\d+)?\//,
  /^http:\/\/127\.0\.0\.1(:\d+)?\//,
  /^http:\/\/backend(:\d+)?\//,
  /^http:\/\/django-backend(:\d+)?\//,
  // Google OAuth profile images
  /^https:\/\/lh[3-6]\.googleusercontent\.com\//,
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Block private/internal networks
    const hostname = parsed.hostname.toLowerCase();
    
    // Block internal IPs
    if (
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.startsWith('192.168.') ||
      hostname === '169.254.169.254' || // AWS metadata
      hostname.includes('metadata') ||
      hostname.includes('internal')
    ) {
      return false;
    }
    
    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Check against allowed patterns
    return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(url));
  } catch {
    return false;
  }
}

function isSupportedByReactPdf(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.includes('jpeg') || ct.includes('jpg') || ct.includes('png') || ct.includes('gif');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const qualityParam = searchParams.get('q');
    const widthParam = searchParams.get('w');
    const heightParam = searchParams.get('h');

    if (!targetUrl) {
      return new Response('Missing url', { status: 400 });
    }

    // SSRF Protection: Validate URL against allowlist
    if (!isAllowedUrl(targetUrl)) {
      console.warn(`[proxy-image] Blocked request to untrusted URL: ${targetUrl}`);
      return new Response('URL not allowed', { status: 403 });
    }

    // Fetch the remote image
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'PCMS-PDF-ImageProxy/1.0',
        'Accept': 'image/*,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return new Response(`Upstream fetch failed: ${res.status}`, { status: 502 });
    }

    const contentType = res.headers.get('content-type');
    const arrayBuffer = await res.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // If already in a PDF-supported format, passthrough (optionally resize/compress)
    if (isSupportedByReactPdf(contentType)) {
      // Optionally downscale/encode to jpeg to reduce size
      const width = widthParam ? parseInt(widthParam, 10) : undefined;
      const height = heightParam ? parseInt(heightParam, 10) : undefined;
      const quality = qualityParam ? Math.min(95, Math.max(40, parseInt(qualityParam, 10))) : 80;

      if (width || height || (contentType && !contentType.includes('jpeg'))) {
        const output = await sharp(inputBuffer)
          .resize(width || undefined, height || undefined, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();

        return new Response(new Uint8Array(output), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=300',
          },
        });
      }

      return new Response(new Uint8Array(inputBuffer), {
        status: 200,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    // Convert unsupported formats (e.g., webp) to JPEG
    const width = widthParam ? parseInt(widthParam, 10) : undefined;
    const height = heightParam ? parseInt(heightParam, 10) : undefined;
    const quality = qualityParam ? Math.min(95, Math.max(40, parseInt(qualityParam, 10))) : 80;

    const converted = await sharp(inputBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(width || undefined, height || undefined, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    return new Response(new Uint8Array(converted), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err: any) {
    return new Response(`Proxy error: ${err?.message || 'unknown error'}`, { status: 500 });
  }
}

