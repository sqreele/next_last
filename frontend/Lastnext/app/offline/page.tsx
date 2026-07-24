import { Metadata } from 'next';
import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { OfflineRetryButton } from '@/app/components/pwa/OfflineRetryButton';

export const metadata: Metadata = {
  title: 'Offline',
  description: 'You are currently offline. HotelCare Pro will resume once your connection returns.',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-cyan-50 px-6 py-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-3xl border border-cyan-100 bg-white/85 p-8 shadow-xl backdrop-blur">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-rose-100 text-rose-600">
          <WifiOff className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">You&apos;re offline</h1>
          <p className="text-sm font-medium text-slate-600">
            HotelCare Pro needs a connection to load fresh work orders. Cached pages remain available, and any
            updates you queue will sync once you&apos;re back online.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            asChild
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <a href="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              Back to dashboard
            </a>
          </Button>
          <OfflineRetryButton>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </OfflineRetryButton>
        </div>
      </div>
    </div>
  );
}
