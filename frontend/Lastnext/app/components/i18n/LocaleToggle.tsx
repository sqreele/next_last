'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { useLocale } from '@/app/lib/i18n/LocaleProvider';
import { cn } from '@/app/lib/utils/cn';

interface LocaleToggleProps {
  className?: string;
}

const LANG_LABELS = {
  en: { label: 'English', short: 'EN' },
  th: { label: 'ภาษาไทย', short: 'TH' },
} as const;

export function LocaleToggle({ className }: LocaleToggleProps) {
  const { locale, setLocale } = useLocale();
  const current = LANG_LABELS[locale];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 touch-manipulation relative', className)}
          aria-label={`Language: ${current.label}. Tap to change.`}
        >
          <Languages className="h-5 w-5" />
          <span className="absolute -bottom-0.5 right-0.5 rounded-full bg-slate-900 px-1 text-[9px] font-bold leading-tight text-white">
            {current.short}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {(Object.keys(LANG_LABELS) as Array<keyof typeof LANG_LABELS>).map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => setLocale(code)}
            className={cn('gap-2', locale === code && 'font-bold')}
          >
            <span className="w-8 text-xs font-bold text-slate-500">{LANG_LABELS[code].short}</span>
            {LANG_LABELS[code].label}
            {locale === code && <span className="ml-auto text-xs text-blue-600">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
