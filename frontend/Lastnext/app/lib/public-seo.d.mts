export const ENGLISH_PUBLIC_PATHS: readonly string[];
export const MARKETING_LANGUAGE_PAIRS: ReadonlyArray<{ en: string; th: string }>;
export function getPublicPageLocale(pathname: string): 'en' | 'th' | null;
export function isMissingPublicPage(pathname: string): boolean;
export function getMarketingAlternates(slug: string, locale: 'en' | 'th', siteUrl: string): {
  canonical: string;
  languages?: Record<string, string>;
};
export function publicNotFoundHtml(locale: 'en' | 'th'): string;
