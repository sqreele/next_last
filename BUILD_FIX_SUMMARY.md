# Next.js Build Fix - "self is not defined" Error

## Problem
The Next.js build was failing during the "Collecting page data" phase with the error:
```
ReferenceError: self is not defined
    at Object.<anonymous> (.next/server/vendor.js:1:1)
```

This occurred because browser-only libraries (`@react-pdf/renderer`, `jspdf`, `html2canvas`) were being bundled into the server-side code.

## Root Cause
1. PDF-related components and utilities were importing browser-only libraries at the module level
2. These components didn't have the `'use client'` directive
3. Next.js 15 treats components as server components by default
4. During the build process, Next.js tried to evaluate these modules on the server side, causing the error

## Solution Applied

### 1. Updated Webpack Configuration (`next.config.mjs`)
Modified the webpack section to exclude browser-only libraries from server-side bundles:
- Added externals configuration for `@react-pdf/renderer`, `jspdf`, `html2canvas`, `canvas`, `jsdom`, and `file-saver`
- These libraries are now marked as externals during server-side builds

### 2. Added 'use client' Directive to PDF Components
The following files now have the `'use client'` directive:
- `app/components/document/PDFMaintenanceGenerator.tsx`
- `app/components/document/JobsPDFGenerator.tsx`
- `app/components/document/ChartDashboardPDF.tsx`
- `app/components/document/JobPDFTemplate.tsx`
- `app/components/document/RoomTopicFilterPDF.tsx`
- `app/components/pdf/MaintenancePDFDocument.tsx`
- `app/lib/pdfFonts.ts`
- `app/lib/services/JobPDFService.ts`

## Testing the Fix

### Option 1: Rebuild Docker Image
```bash
cd /home/sqreele/next_last
docker-compose build frontend
docker-compose up -d
```

### Option 2: Test Build Locally (if you have Node.js installed)
```bash
cd /home/sqreele/next_last/frontend/Lastnext
npm install  # if needed
npm run build
```

### Option 3: Build Specific Dockerfile
```bash
cd /home/sqreele/next_last/frontend/Lastnext
docker build -f Dockerfile -t next-app-test .
```

## What Changed in the Build Process

**Before:**
- Browser-only libraries were being bundled into `.next/server/vendor.js`
- Server-side code tried to execute browser-only code during build
- Build failed with "self is not defined"

**After:**
- Browser-only libraries are excluded from server bundles
- PDF components are explicitly marked as client-side only
- Build completes successfully
- PDF generation still works in the browser

## Verification

After rebuilding, the build should:
1. ✅ Complete compilation successfully
2. ✅ Pass the "Checking validity of types" phase
3. ✅ Complete "Collecting page data" without errors
4. ✅ Generate the production build

## Additional Notes

- PDF generation functionality remains unchanged and will work normally in the browser
- The `pdfRenderer.ts` utility already uses dynamic imports, which is good practice
- All components that use PDF libraries are now properly isolated to client-side only
- Server-side rendering is not attempted for any PDF-related components

## If the Issue Persists

If you still see the error after rebuilding:
1. Clear the `.next` directory: `rm -rf frontend/Lastnext/.next`
2. Clear node_modules: `rm -rf frontend/Lastnext/node_modules`
3. Reinstall dependencies: `cd frontend/Lastnext && npm install`
4. Rebuild the Docker image completely: `docker-compose build --no-cache frontend`

## Files Modified

1. `frontend/Lastnext/next.config.mjs` - Webpack externals configuration
2. `frontend/Lastnext/app/components/document/PDFMaintenanceGenerator.tsx` - Added 'use client'
3. `frontend/Lastnext/app/components/document/JobsPDFGenerator.tsx` - Added 'use client'
4. `frontend/Lastnext/app/components/document/ChartDashboardPDF.tsx` - Added 'use client'
5. `frontend/Lastnext/app/components/document/JobPDFTemplate.tsx` - Added 'use client'
6. `frontend/Lastnext/app/components/document/RoomTopicFilterPDF.tsx` - Added 'use client'
7. `frontend/Lastnext/app/components/pdf/MaintenancePDFDocument.tsx` - Added 'use client'
8. `frontend/Lastnext/app/lib/pdfFonts.ts` - Added 'use client'
9. `frontend/Lastnext/app/lib/services/JobPDFService.ts` - Added 'use client'

