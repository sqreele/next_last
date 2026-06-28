import { Suspense } from 'react';
import { type Metadata, type Viewport } from 'next';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from '@/app/providers';
import { Toaster } from '@/app/components/ui/toaster';
import { RouteTransitionLoader } from '@/app/components/ui/loading/RouteTransitionLoader';
import { StoreProvider } from '@/app/lib/providers/StoreProvider';
import { SWRProvider } from '@/app/lib/swr-config'; // ✅ PERFORMANCE: Global SWR caching
import { ServiceWorkerRegistrar } from '@/app/components/pwa/ServiceWorkerRegistrar';
import { InstallPrompt } from '@/app/components/pwa/InstallPrompt';
import { NetworkStatusBanner } from '@/app/components/pwa/NetworkStatusBanner';
import { ThemeProvider } from '@/app/components/theme/ThemeProvider';
import { LocaleProvider } from '@/app/lib/i18n/LocaleProvider';
import './globals.css';
// Bilingual UI font (Thai + English)
const lineSeed = localFont({
  src: [
    { path: '../public/fonts/Web/WOFF2/LINESeedSansTH_W_Th.woff2', weight: '300', style: 'normal' },
    { path: '../public/fonts/Web/WOFF2/LINESeedSansTH_W_Rg.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/Web/WOFF2/LINESeedSansTH_W_Bd.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/Web/WOFF2/LINESeedSansTH_W_XBd.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-ui',
  display: 'swap',
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  colorScheme: 'light dark',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HotelEngPro" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="color-scheme" content="light dark" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="manifest" href="/manifest.json" />
        {/* Pre-hydration theme bootstrap — keeps the page from flashing the
            wrong theme between SSR and ThemeProvider mount. Reads the same
            localStorage key the provider uses. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('pcms-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=(s==='dark')||((s==='system'||!s)&&m);if(d){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${lineSeed.variable} font-sans min-h-screen bg-background`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-gray-900 focus:shadow-lg focus:ring-2 focus:ring-blue-600"
        >
          Skip to main content
        </a>
        <SWRProvider>
          <ThemeProvider>
          <LocaleProvider>
          <AuthProvider>
            <StoreProvider>
              <Suspense fallback={null}>
                <RouteTransitionLoader />
              </Suspense>
              <NetworkStatusBanner />
              <main id="main-content" className="flex min-h-screen w-full flex-col">
                {children}
              </main>
              <Toaster />
              <ServiceWorkerRegistrar />
              <InstallPrompt />
            </StoreProvider>
          </AuthProvider>
          </LocaleProvider>
          </ThemeProvider>
        </SWRProvider>
        <Analytics />
      </body>
    </html>
  );
}
