// Wrapper for @react-pdf/renderer to handle import issues
import { pdfDebug } from '@/app/lib/utils/pdfDebug';
let pdfFunction: any = null;
let importError: Error | null = null;

// Try to import pdf function with multiple fallbacks
async function ensurePdfFunction() {
  if (pdfFunction) return pdfFunction;
  if (importError) throw importError;

  try {
    // First try: named import
    pdfDebug.pdfImport('start');
    const { pdf } = await import('@react-pdf/renderer');
    if (typeof pdf === 'function') {
      pdfFunction = pdf;
      pdfDebug.pdfImport('named-success');
      return pdfFunction;
    }
    
    // Second try: full module import
    const ReactPDF = await import('@react-pdf/renderer');
    if (ReactPDF.pdf && typeof ReactPDF.pdf === 'function') {
      pdfFunction = ReactPDF.pdf;
      pdfDebug.pdfImport('module-success');
      return pdfFunction;
    }
    
    // Third try: default export
    if ((ReactPDF as any).default?.pdf && typeof (ReactPDF as any).default.pdf === 'function') {
      pdfFunction = (ReactPDF as any).default.pdf;
      pdfDebug.pdfImport('default-success');
      return pdfFunction;
    }
    
    // Fourth try: check all exports
    const availableExports = Object.keys(ReactPDF);
    console.log('Available exports from @react-pdf/renderer:', availableExports);
    
    // Look for pdf function in any export
    for (const key of availableExports) {
      if (key.toLowerCase().includes('pdf') && typeof (ReactPDF as any)[key] === 'function') {
        pdfFunction = (ReactPDF as any)[key];
        console.log(`Found pdf function as: ${key}`);
        pdfDebug.pdfImport('scanned-success', { key });
        return pdfFunction;
      }
    }
    
    throw new Error(`Could not find pdf function in @react-pdf/renderer. Available exports: ${availableExports.join(', ')}`);
  } catch (error) {
    importError = error as Error;
    console.error('Failed to import @react-pdf/renderer:', error);
    pdfDebug.error('pdfRenderer.import.failed', error as Error);
    throw error;
  }
}

export async function generatePdfBlob(documentElement: React.ReactElement): Promise<Blob> {
  const pdf = await ensurePdfFunction();
  pdfDebug.log('pdfRenderer.generatePdfBlob.start');
  const instance = pdf(documentElement);
  
  if (!instance || typeof instance.toBlob !== 'function') {
    const err = new Error('PDF instance does not have toBlob method');
    pdfDebug.error('pdfRenderer.generatePdfBlob.invalidInstance', err);
    throw err;
  }
  
  try {
    const blob = await instance.toBlob();
    pdfDebug.log('pdfRenderer.generatePdfBlob.success', { size: (blob as any)?.size || null });
    return blob;
  } catch (e) {
    pdfDebug.error('pdfRenderer.generatePdfBlob.failed', e as Error);
    throw e;
  }
}

// Re-export types and components
export { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
export type { Styles } from '@react-pdf/renderer';