// app/providers.tsx
'use client'

export function AuthProvider({
  children
}: {
  children: React.ReactNode
}) {
  // In Auth0 v4, authentication is handled server-side
  // No client-side provider is needed
  return <>{children}</>;
}