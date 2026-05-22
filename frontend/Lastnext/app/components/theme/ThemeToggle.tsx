'use client';

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { useTheme } from '@/app/components/theme/ThemeProvider';
import { cn } from '@/app/lib/utils/cn';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, resolved, setTheme } = useTheme();
  const Icon = resolved === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 touch-manipulation', className)}
          aria-label={`Theme: ${theme}. Tap to change.`}
        >
          <Icon className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={cn('gap-2', theme === 'light' && 'font-bold')}
        >
          <Sun className="h-4 w-4" />
          Light
          {theme === 'light' && <span className="ml-auto text-xs text-blue-600">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={cn('gap-2', theme === 'dark' && 'font-bold')}
        >
          <Moon className="h-4 w-4" />
          Dark
          {theme === 'dark' && <span className="ml-auto text-xs text-blue-600">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={cn('gap-2', theme === 'system' && 'font-bold')}
        >
          <Monitor className="h-4 w-4" />
          System
          {theme === 'system' && <span className="ml-auto text-xs text-blue-600">●</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
