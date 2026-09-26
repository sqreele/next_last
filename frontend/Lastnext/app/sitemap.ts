import type { MetadataRoute } from "next";

import {
  englishMarketingPages,
  thaiMarketingPages,
} from "@/app/lib/marketing-pages";
import { seoConfig } from "@/app/lib/seo-config";

const urlFor = (path = "") => new URL(path, `${seoConfig.siteUrl}/`).href;

/**
 * Public, canonical pages only. Authenticated dashboards, reports, and other
 * tenant-specific URLs are deliberately excluded from search indexing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const corePages: MetadataRoute.Sitemap = [
    {
      url: urlFor(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: urlFor("contact/"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: urlFor("pricing/"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  const englishPages: MetadataRoute.Sitemap = Object.values(
    englishMarketingPages,
  ).map((page) => ({
    url: urlFor(`${page.slug}/`),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const thaiPages: MetadataRoute.Sitemap = Object.values(thaiMarketingPages).map(
    (page) => ({
      url: urlFor(`th/${page.slug}/`),
      changeFrequency: "monthly",
      priority: 0.8,
    }),
  );

  return [...corePages, ...englishPages, ...thaiPages];
}
