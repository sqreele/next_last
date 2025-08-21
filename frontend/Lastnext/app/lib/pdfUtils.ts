export const isPdfBlob = async (blob: Blob): Promise<boolean> => {
  try {
    const header = await blob.slice(0, 5).text();
    return header.startsWith('%PDF-');
  } catch {
    return false;
  }
};

export const withPdfContentType = (blob: Blob): Blob => {
  if (blob.type === 'application/pdf') return blob;
  return new Blob([blob], { type: 'application/pdf' });
};

// Alternative PDF download function that's more reliable
export const downloadPdf = async (blob: Blob, filename: string): Promise<void> => {
  try {
    // Method 1: Try to use file-saver if available
    if (typeof window !== 'undefined') {
      try {
        // Dynamic import with fallback
        const fileSaver = await import('file-saver');
        const saveAs = fileSaver.saveAs || fileSaver.default?.saveAs;
        
        if (saveAs && typeof saveAs === 'function') {
          const typedBlob = withPdfContentType(blob);
          const looksValid = await isPdfBlob(typedBlob);
          if (!looksValid) {
            throw new Error('Generated file is not a valid PDF (missing %PDF header).');
          }
          saveAs(typedBlob, filename);
          return;
        }
      } catch (importError) {
        console.warn('file-saver import failed, trying fallback method:', importError);
      }
    }
    
    // Method 2: Fallback to native browser download
    console.log('Using fallback download method');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
    
  } catch (error) {
    console.error('PDF download failed:', error);
    throw new Error(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const saveBlobAsPdf = async (blob: Blob, filename: string): Promise<void> => {
  try {
    // Try to import file-saver dynamically
    let saveAs: any;
    
    try {
      const fileSaverModule = await import('file-saver');
      saveAs = fileSaverModule.saveAs || fileSaverModule.default?.saveAs;
    } catch (importError) {
      console.warn('Failed to import file-saver dynamically:', importError);
    }
    
    // If dynamic import failed, try to use global saveAs (if available)
    if (!saveAs && typeof window !== 'undefined' && (window as any).saveAs) {
      saveAs = (window as any).saveAs;
    }
    
    // Fallback: create a download link if saveAs is not available
    if (!saveAs) {
      console.warn('saveAs not available, using fallback download method');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }
    
    const typedBlob = withPdfContentType(blob);
    const looksValid = await isPdfBlob(typedBlob);
    if (!looksValid) {
      throw new Error('Generated file is not a valid PDF (missing %PDF header).');
    }
    
    saveAs(typedBlob, filename);
  } catch (error) {
    console.error('Error saving PDF:', error);
    throw new Error(`Failed to save PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// New helper function with retry logic
export const generatePdfWithRetry = async (
  pdfGenerator: () => Promise<Blob>,
  maxRetries: number = 3
): Promise<Blob> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`PDF generation attempt ${i + 1}/${maxRetries}`);
      const blob = await pdfGenerator();
      
      // Validate the blob
      if (!blob || blob.size === 0) {
        throw new Error('Generated PDF blob is empty');
      }
      
      // Check if it's a valid PDF
      const isValid = await isPdfBlob(blob);
      if (!isValid && i < maxRetries - 1) {
        console.warn(`Generated blob is not a valid PDF, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        continue;
      }
      
      return blob;
    } catch (error) {
      console.error(`PDF generation attempt ${i + 1} failed:`, error);
      lastError = error as Error;
      
      if (i < maxRetries - 1) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }
  
  throw lastError || new Error('Failed to generate PDF after multiple attempts');
};