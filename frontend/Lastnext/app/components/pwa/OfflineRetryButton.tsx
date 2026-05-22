'use client';

import { Button } from '@/app/components/ui/button';

export function OfflineRetryButton({ children }: { children: React.ReactNode }) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }}
    >
      {children}
    </Button>
  );
}
