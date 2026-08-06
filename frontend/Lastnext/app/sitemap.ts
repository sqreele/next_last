import { MetadataRoute } from "next";
import {
  englishMarketingPages,
  thaiMarketingPages,
} from "@/app/lib/marketing-pages";

// Dynamic sitemap generation for HotelCare Pro
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://hotelcarepro.com";

  // Static pages that should be indexed
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/auth/login`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/auth/register`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
  ];

  const marketingPages = [
    ...Object.keys(englishMarketingPages).map((slug) => `/${slug}`),
    ...Object.keys(thaiMarketingPages).map((slug) => `/th/${slug}`),
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.85,
  }));

  // Dashboard pages (these are behind auth but can still be in sitemap for logged-in crawlers)
  const dashboardPages = [
    "/dashboard",
    "/dashboard/my-jobs",
    "/dashboard/create-job",
    "/dashboard/preventive-maintenance",
    "/dashboard/machines",
    "/dashboard/inventory",
    "/dashboard/rooms/by-topics",
    "/dashboard/rooms/topic-mismatch",
    "/dashboard/jobs/by-topic",
    "/dashboard/jobs-report",
    "/dashboard/chartdashboard",
    "/dashboard/profile",
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...marketingPages, ...dashboardPages];
}
