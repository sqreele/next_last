import { MetadataRoute } from 'next';

// Robots.txt configuration for HotelCare Pro
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hotelcarepro.com';
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',           // Protect API routes
          '/auth/callback',  // Protect auth callbacks
          '/_next/',         // Protect Next.js internals
          '/private/',       // Protect private routes if any
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/', '/auth/callback'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

