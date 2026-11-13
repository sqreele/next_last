// Public URLs with fixed content languages, independent of application preferences.
export const ENGLISH_PUBLIC_PATHS = [
  '/', '/contact/', '/pricing/', '/hotel-maintenance-software/',
  '/hotel-engineering-management/', '/preventive-maintenance-hotel/',
  '/hotel-work-order-system/', '/hotel-cmms/', '/hotel-asset-management/',
  '/hotel-maintenance-checklist/', '/hotel-engineering-report/',
];

export const MARKETING_LANGUAGE_PAIRS = [
  { en: 'hotel-maintenance-software', th: 'ระบบบริหารงานซ่อมบำรุงโรงแรม' },
  { en: 'hotel-work-order-system', th: 'ระบบแจ้งซ่อมโรงแรม' },
];

const applicationRoots = new Set([
  'api', 'internal-api', 'auth', 'dashboard', 'platform', 'report', 'demo',
  'invitations', 'ai-chat', 'login', 'offline', 'admin', '_next', 'static',
  'images', 'fonts', 'branding', 'media', 'jobs', 'preventive-maintenance',
  'rooms', 'profile', 'createJob', 'myJobs', 'jobs-report',
]);

function normalizePath(pathname) {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded === '/' ? '/' : `${decoded.replace(/\/$/, '')}/`;
  } catch {
    return null;
  }
}

export function getPublicPageLocale(pathname) {
  const path = normalizePath(pathname);
  if (ENGLISH_PUBLIC_PATHS.includes(path)) return 'en';
  if (MARKETING_LANGUAGE_PAIRS.some(pair => path === `/th/${pair.th}/`)) return 'th';
  return null;
}

export function isMissingPublicPage(pathname) {
  const path = normalizePath(pathname);
  if (!path) return true;
  if (getPublicPageLocale(path)) return false;
  const root = path.split('/')[1];
  return !applicationRoots.has(root);
}

export function getMarketingAlternates(slug, locale, siteUrl) {
  const url = (path) => new URL(path, `${siteUrl}/`).href;
  const canonical = url(`${locale === 'th' ? 'th/' : ''}${slug}/`);
  const pair = MARKETING_LANGUAGE_PAIRS.find(pair => pair[locale] === slug);
  return {
    canonical,
    ...(pair ? { languages: { en: url(`${pair.en}/`), th: url(`th/${pair.th}/`) } } : {}),
  };
}

export function publicNotFoundHtml(locale) {
  const thai = locale === 'th';
  const title = thai ? 'ไม่พบหน้าที่ต้องการ' : 'Page not found';
  const message = thai ? 'หน้านี้อาจถูกย้ายหรือลบแล้ว' : 'This page may have moved or no longer exists.';
  const home = thai ? 'กลับหน้าหลัก' : 'Back to home';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${title} | StayMaint</title><style>body{margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}main{max-width:36rem;margin:15vh auto;padding:2rem}a{color:#0f766e}h1{font-size:2rem}p{line-height:1.6}</style></head><body><main><a href="/">StayMaint</a><p>404</p><h1>${title}</h1><p>${message}</p><a href="/">${home}</a></main></body></html>`;
}
