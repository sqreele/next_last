import { type Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from '@/app/providers';
import { Toaster } from '@/app/components/ui/toaster';
import { StoreProvider } from '@/app/lib/providers/StoreProvider';
import './globals.css';
// Initialize Inter font
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

// SEO-Optimized Metadata for Maintenance and Job Management Web App
export const metadata: Metadata = {
  title: {
    default: 'Maintenance & Job Management Dashboard',
    template: '%s | Maintenance & Job Management Dashboard',
  },
  description: 'Streamline property maintenance and job management with our Next.js-powered dashboard. Track, assign, and manage tasks efficiently using TypeScript, Tailwind CSS, and Auth0.',
  keywords: [
    'maintenance management',
    'job management',
    'property maintenance',
    'task tracking',
    'admin dashboard',
    'nextjs',
    'typescript',
    'tailwind css',
    'auth0',
    'facility management',
  ],
  authors: [
    {
      name: 'Your Name', // Replace with your actual name
      url: 'https://pcms.live',
    },
  ],
  creator: 'Your Name', // Replace with your actual name
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://pcms.live',
    title: 'Maintenance & Job Management Dashboard',
    description: 'Efficiently manage maintenance tasks and jobs with our modern admin dashboard built with Next.js, Postgres, Auth0, and Tailwind CSS. Perfect for property managers and facility teams.',
    siteName: 'Maintenance & Job Management Dashboard',
    images: [
      {
        url: 'https://pcms.live/og-image.jpg', // Replace with actual image URL
        width: 1200,
        height: 630,
        alt: 'Maintenance & Job Management Dashboard Preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Maintenance & Job Management Dashboard',
    description: 'A powerful tool for property maintenance and job management, built with Next.js, TypeScript, and Tailwind CSS. Track and manage tasks seamlessly.',
    creator: '@yourtwitter', // Replace with your Twitter handle
    images: ['https://pcms.live/twitter-image.jpg'], // Replace with actual image URL
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen bg-background`}>
        <AuthProvider>
          <StoreProvider>
            <main className="flex min-h-screen w-full flex-col">
              {children}
            </main>
            <Toaster />
          </StoreProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
