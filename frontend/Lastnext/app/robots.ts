import { MetadataRoute } from 'next';

const siteUrl = 'https://staymaint.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/dashboard/',
          '/invitations/',
          '/platform/',
          '/report/',
          '/ai-chat/',
          '/login/',
          '/offline/',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
