export function resolveClientLocale<T extends string>(
  storedLocale: string | null | undefined,
  initialLocale: T,
  supportedLocales: readonly T[],
): T;

export function interpolateTranslation(
  template: string,
  values?: Record<string, string | number>,
): string;
