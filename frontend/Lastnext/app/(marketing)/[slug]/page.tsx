import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLandingPage } from "@/app/components/marketing/SeoLandingPage";
import { englishMarketingPages } from "@/app/lib/marketing-pages";
import { seoConfig } from "@/app/lib/seo-config";

export function generateStaticParams() {
  return Object.keys(englishMarketingPages).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = englishMarketingPages[slug];
  if (!page) return {};
  const url = `${seoConfig.siteUrl}/${page.slug}`;
  return {
    title: page.metaTitle,
    description: page.description,
    keywords: [
      page.slug.replaceAll("-", " "),
      "HotelCare Pro",
      "hotel maintenance software",
    ],
    alternates: { canonical: url },
    openGraph: {
      title: page.metaTitle,
      description: page.description,
      url,
      siteName: seoConfig.siteName,
      type: "website",
      locale: "en_US",
      images: seoConfig.openGraph.images,
    },
    twitter: {
      card: seoConfig.twitter.cardType,
      title: page.metaTitle,
      description: page.description,
      creator: seoConfig.twitter.handle,
    },
  };
}

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = englishMarketingPages[slug];
  if (!page) notFound();
  return <SeoLandingPage page={page} />;
}
