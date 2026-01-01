import { MetadataRoute } from 'next';

// Dynamic sitemap generation for HotelEngPro
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pcms.live';
  
  // Static pages that should be indexed
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/auth/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/auth/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
  ];

  // Dashboard pages (these are behind auth but can still be in sitemap for logged-in crawlers)
  const dashboardPages = [
    '/dashboard',
    '/dashboard/myJobs',
    '/dashboard/createJob',
    '/dashboard/preventive-maintenance',
    '/dashboard/machines',
    '/dashboard/inventory',
    '/dashboard/rooms/by-topics',
    '/dashboard/jobs/by-topic',
    '/dashboard/jobs-report',
    '/dashboard/chartdashboard',
    '/dashboard/profile',
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...dashboardPages];
}

