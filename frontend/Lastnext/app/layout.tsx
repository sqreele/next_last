import { type Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from '@/app/providers';
import { Toaster } from '@/app/components/ui/toaster';
import { StoreProvider } from '@/app/lib/providers/StoreProvider';
import { SWRProvider } from '@/app/lib/swr-config'; // ✅ PERFORMANCE: Global SWR caching
import './globals.css';
// Initialize Inter font
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

// SEO-Optimized Metadata for HotelEngPro - Hotel Engineering & Maintenance Management
export const metadata: Metadata = {
  title: {
    default: 'HotelEngPro - Hotel Engineering & Maintenance Dashboard',
    template: '%s | HotelEngPro',
  },
  description: 'HotelEngPro - Professional hotel engineering and maintenance management platform. Streamline property maintenance, track jobs, and manage tasks efficiently for hotels and hospitality.',
  keywords: [
    'HotelEngPro',
    'hotel engineering',
    'hotel maintenance',
    'property maintenance',
    'hospitality management',
    'facility management',
    'job management',
    'task tracking',
    'hotel operations',
    'maintenance dashboard',
  ],
  authors: [
    {
      name: 'HotelEngPro',
      url: 'https://pcms.live',
    },
  ],
  creator: 'HotelEngPro',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://pcms.live',
    title: 'HotelEngPro - Hotel Engineering & Maintenance Dashboard',
    description: 'HotelEngPro - Professional hotel engineering and maintenance management. Efficiently manage maintenance tasks and jobs with our modern dashboard. Perfect for hotel engineers and facility teams.',
    siteName: 'HotelEngPro',
    images: [
      {
        url: 'https://pcms.live/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'HotelEngPro - Hotel Engineering & Maintenance Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HotelEngPro - Hotel Engineering & Maintenance Dashboard',
    description: 'HotelEngPro - Professional hotel engineering and maintenance management. Track and manage hotel maintenance tasks seamlessly.',
    creator: '@HotelEngPro',
    images: ['https://pcms.live/twitter-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, minimum-scale=1, user-scalable=yes, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1f2937" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HotelEngPro" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen bg-background`}>
        <SWRProvider>
          <AuthProvider>
            <StoreProvider>
              <main className="flex min-h-screen w-full flex-col">
                {children}
              </main>
              <Toaster />
            </StoreProvider>
          </AuthProvider>
        </SWRProvider>
        <Analytics />
      </body>
    </html>
  );
}
