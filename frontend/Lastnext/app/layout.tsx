import { Suspense } from 'react';
import { type Metadata, type Viewport } from 'next';
import localFont from 'next/font/local';
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
import { PropertyAccessGuard } from '@/app/components/auth/PropertyAccessGuard';
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

// SEO-Optimized Metadata for HotelCare Pro - Hotel Engineering & Maintenance Management
export const metadata: Metadata = {
  title: {
    default: 'StayMaint - Smart Hotel Maintenance and Engineering Management Software',
    template: '%s | StayMaint',
  },
  description: 'Manage work orders, preventive maintenance, assets, rooms, technicians and engineering reports in one StayMaint platform.',
  keywords: [
    'StayMaint',
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
      name: 'StayMaint',
      url: 'https://staymaint.com',
    },
  ],
  creator: 'StayMaint',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://staymaint.com',
    title: 'StayMaint - Hotel Engineering & Maintenance Dashboard',
    description: 'StayMaint - Professional hotel engineering and maintenance management. Efficiently manage maintenance tasks and jobs with our modern dashboard. Perfect for hotel engineers and facility teams.',
    siteName: 'StayMaint',
    images: [
      {
        url: 'https://staymaint.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'StayMaint - Hotel Engineering & Maintenance Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StayMaint - Hotel Engineering & Maintenance Dashboard',
    description: 'StayMaint - Professional hotel engineering and maintenance management. Track and manage hotel maintenance tasks seamlessly.',
    creator: '@StayMaint',
    images: ['https://staymaint.com/twitter-image.jpg'],
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
  icons: {
    icon: [
      { url: '/branding/logo-mark-dark-tile.svg', type: 'image/svg+xml' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
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
    { media: '(prefers-color-scheme: light)', color: '#0d9488' },
    { media: '(prefers-color-scheme: dark)', color: '#10282b' },
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
        <meta name="apple-mobile-web-app-title" content="StayMaint" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="color-scheme" content="light dark" />
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-card focus:ring-2 focus:ring-ring"
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
              <div id="main-content" className="flex min-h-screen w-full flex-col">
                <Suspense fallback={null}>
                  <PropertyAccessGuard>{children}</PropertyAccessGuard>
                </Suspense>
              </div>
              <Toaster />
              <ServiceWorkerRegistrar />
              <InstallPrompt />
            </StoreProvider>
          </AuthProvider>
          </LocaleProvider>
          </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
