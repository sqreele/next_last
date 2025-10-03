// app/lib/utils/pdfDebug.ts
// Avoid TS Node type dependency
declare const process: any;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface PdfDebugEvent {
  timestamp: string;
  type: string;
  name: string;
  data?: { [key: string]: JsonValue };
  error?: { message: string; stack?: string };
}

interface PdfDebugContext {
  [key: string]: JsonValue;
}

interface PdfDebugReport {
  id: string;
  startedAt: string;
  finishedAt?: string;
  context: PdfDebugContext;
  events: PdfDebugEvent[];
}

let activeReport: PdfDebugReport | null = null;

function safeNowIso(): string {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

function createId(): string {
  try {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  } catch {
    return `${Date.now()}`;
  }
}

function limitSize<T extends object>(obj: T, maxLen = 200_000): T | { note: string } {
  try {
    const str = JSON.stringify(obj);
    if (str.length <= maxLen) return obj;
    return { note: `omitted: ${str.length} bytes > limit ${maxLen}` } as any;
  } catch {
    return { note: 'unserializable' } as any;
  }
}

export const pdfDebug = {
  isActive(): boolean {
    return !!activeReport;
  },

  startSession(context?: PdfDebugContext): void {
    try {
      const baseContext: PdfDebugContext = {};
      try {
        baseContext.nodeEnv = (process as any)?.env?.NODE_ENV || null;
        baseContext.publicMediaUrl = (process as any)?.env?.NEXT_PUBLIC_MEDIA_URL || null;
      } catch {}
      try {
        if (typeof window !== 'undefined') {
          baseContext.location = {
            href: window.location?.href || null,
            origin: window.location?.origin || null,
            hostname: window.location?.hostname || null,
          } as any;
          baseContext.userAgent = (navigator && (navigator as any).userAgent) || null;
        }
      } catch {}

      activeReport = {
        id: createId(),
        startedAt: safeNowIso(),
        context: limitSize({ ...baseContext, ...(context || {}) }),
        events: [],
      };
    } catch {}
  },

  log(name: string, data?: { [key: string]: JsonValue }): void {
    if (!activeReport) return;
    try {
      activeReport.events.push({ timestamp: safeNowIso(), type: 'log', name, data: limitSize(data || {}) });
    } catch {}
  },

  error(name: string, error: unknown, data?: { [key: string]: JsonValue }): void {
    if (!activeReport) return;
    try {
      const err = error as any;
      activeReport.events.push({
        timestamp: safeNowIso(),
        type: 'error',
        name,
        data: limitSize(data || {}),
        error: { message: String(err?.message || err), stack: String(err?.stack || '') },
      });
    } catch {}
  },

  pdfImport(step: string, data?: { [key: string]: JsonValue }): void {
    this.log(`pdfRenderer.import.${step}`, data);
  },

  imageResolve(data: { sourceUrl?: string; resolvedUrl?: string; note?: string; baseUrl?: string; extension?: string }): void {
    this.log('image.resolve', data as any);
  },

  imageValidate(data: { url?: string; valid: boolean; error?: string }): void {
    this.log('image.validate', data as any);
  },

  finishSession(): PdfDebugReport | null {
    if (!activeReport) return null;
    try {
      activeReport.finishedAt = safeNowIso();
      return activeReport;
    } finally {
      activeReport = null;
    }
  },

  getReport(): PdfDebugReport | null {
    return activeReport ? { ...activeReport } : null;
  },

  downloadReport(filename?: string): void {
    try {
      const report = this.finishSession();
      if (!report) return;
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:]/g, '-');
      a.download = filename || `jobs-pdf-debug-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {}
  },
};

