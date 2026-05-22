'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { useT } from '@/app/lib/i18n/LocaleProvider';

const DISMISSED_KEY = 'pcms-install-prompt-dismissed';
const DISMISS_DAYS = 14;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissedAt = window.localStorage.getItem(DISMISSED_KEY);
  if (!dismissedAt) return true;
  const ts = Number(dismissedAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Non-intrusive "Add to home screen" prompt for Android/Chrome.
 * iOS does not fire `beforeinstallprompt`; we leave Safari's native UI alone.
 */
export function InstallPrompt() {
  const t = useT();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!shouldShow()) return;
    // Already installed -> bail.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !deferred) return null;

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    }
  };

  const install = async () => {
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted' && typeof window !== 'undefined') {
        window.localStorage.removeItem(DISMISSED_KEY);
      }
    } catch (error) {
      console.warn('Install prompt failed:', error);
    } finally {
      setVisible(false);
      setDeferred(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="pcms-install-title"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:bottom-6"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-blue-100 text-blue-700">
        <Download className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p id="pcms-install-title" className="text-sm font-bold text-slate-900">
          {t('pwa.installTitle')}
        </p>
        <p className="text-xs text-slate-600">
          {t('pwa.installBody')}
        </p>
      </div>
      <Button size="sm" onClick={install} className="bg-blue-600 text-white hover:bg-blue-700">
        {t('pwa.installButton')}
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
