'use client';

import { ReactNode } from 'react';
import { useMainStore } from '../stores/mainStore';

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  // Initialize the store - Zustand handles the rest automatically
  // No need to wrap children in multiple providers
  
  return <>{children}</>;
}

// Optional: Add a hook for components that need access to the entire store
export const useStore = useMainStore;
