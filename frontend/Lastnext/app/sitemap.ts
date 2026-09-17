import { MetadataRoute } from "next";
import {
  englishMarketingPages,
  thaiMarketingPages,
} from "@/app/lib/marketing-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://staymaint.com";

  // Only public canonical pages belong in the sitemap.
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/contact/`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/pricing/`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
  ];

  const marketingPages = [
    ...Object.keys(englishMarketingPages).map((slug) => `/${slug}`),
    ...Object.keys(thaiMarketingPages).map((slug) => `/th/${slug}`),
  ].map((path) => ({
    url: `${baseUrl}${path}/`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.85,
  }));

  return [...staticPages, ...marketingPages];
}
