import type { Metadata } from 'next';
import { ContactPageClient } from './ContactPageClient';
import { seoConfig } from '@/app/lib/seo-config';

const description =
  'Contact StayMaint for hotel maintenance management account access, technical support guidance, and SaaS inquiries.';

export const metadata: Metadata = {
  title: 'Contact StayMaint',
  description,
  alternates: {
    canonical: `${seoConfig.siteUrl}/contact/`,
  },
  openGraph: {
    title: 'Contact StayMaint',
    description,
    url: `${seoConfig.siteUrl}/contact/`,
    siteName: seoConfig.siteName,
    type: 'website',
    locale: 'en_US',
    images: seoConfig.openGraph.images,
  },
  twitter: {
    card: seoConfig.twitter.cardType,
    title: 'Contact StayMaint',
    description,
    creator: seoConfig.twitter.handle,
  },
};

export default function ContactPage() {
  return <ContactPageClient />;
}
