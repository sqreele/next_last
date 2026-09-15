import type { Metadata } from "next";
import HomepageClient from "@/app/HomepageClient";
import { seoConfig } from "@/app/lib/seo-config";

const description =
  "Manage work orders, preventive maintenance, assets, rooms, technicians and engineering reports in one StayMaint platform.";

export const metadata: Metadata = {
  title: "Smart Hotel Maintenance and Engineering Management Software",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "StayMaint | Hotel Maintenance and Engineering Management Software",
    description,
    url: seoConfig.siteUrl,
    siteName: seoConfig.siteName,
    type: "website",
    locale: "en_US",
    images: seoConfig.openGraph.images,
  },
  twitter: {
    card: seoConfig.twitter.cardType,
    title: "StayMaint | Hotel Maintenance and Engineering Management Software",
    description,
    creator: seoConfig.twitter.handle,
    images: seoConfig.openGraph.images.map((image) => image.url),
  },
};

const homepageSchema = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${seoConfig.siteUrl}/#organization`, name: seoConfig.siteName, url: seoConfig.siteUrl },
    { "@type": "WebSite", "@id": `${seoConfig.siteUrl}/#website`, name: seoConfig.siteName, url: seoConfig.siteUrl, publisher: { "@id": `${seoConfig.siteUrl}/#organization` } },
    { "@type": "SoftwareApplication", name: seoConfig.siteName, url: seoConfig.siteUrl, applicationCategory: "BusinessApplication", operatingSystem: "Web", description, publisher: { "@id": `${seoConfig.siteUrl}/#organization` } },
  ],
};

export default function Homepage() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }} /><HomepageClient /></>;
}
