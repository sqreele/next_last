import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLandingPage } from "@/app/components/marketing/SeoLandingPage";
import { thaiMarketingPages } from "@/app/lib/marketing-pages";
import { seoConfig } from "@/app/lib/seo-config";

export function generateStaticParams() {
  return Object.keys(thaiMarketingPages).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = thaiMarketingPages[decodeURIComponent(slug)];
  if (!page) return {};
  const url = `${seoConfig.siteUrl}/th/${page.slug}`;
  return {
    title: page.metaTitle,
    description: page.description,
    keywords: [page.slug, "HotelCare Pro", "โปรแกรมซ่อมบำรุงโรงแรม"],
    alternates: { canonical: url },
    openGraph: {
      title: page.metaTitle,
      description: page.description,
      url,
      siteName: seoConfig.siteName,
      type: "website",
      locale: "th_TH",
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

export default async function ThaiMarketingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = thaiMarketingPages[decodeURIComponent(slug)];
  if (!page) notFound();
  return <SeoLandingPage page={page} />;
}
