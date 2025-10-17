# Rebuild Instructions After Build Fix

## Quick Rebuild (Recommended)

### Option 1: Using docker-compose
```bash
cd /home/sqreele/next_last
docker-compose build --no-cache frontend
docker-compose up -d
```

### Option 2: Build frontend Docker image directly
```bash
cd /home/sqreele/next_last/frontend/Lastnext
docker build --no-cache -f Dockerfile -t next-app .
```

## What to Expect

### Before the Fix:
```
#41 158.4 unhandledRejection ReferenceError: self is not defined
#41 158.4     at Object.<anonymous> (.next/server/vendor.js:1:1)
#41 158.6 ⚠️  Next.js build failed on attempt 1, retrying...
```

### After the Fix (Expected):
```
✓ Compiled successfully in XX.Xs
  Skipping linting
  Checking validity of types ...
  Collecting page data ...
  Generating static pages (0/X)
  ...
✅ Next.js build successful on attempt 1
```

## Troubleshooting

### If the build still fails:

1. **Clear Docker cache completely:**
   ```bash
   docker-compose down
   docker system prune -a
   docker-compose build --no-cache
   docker-compose up -d
   ```

2. **Check if changes are in the container:**
   ```bash
   # Build and inspect the image
   docker build -f frontend/Lastnext/Dockerfile -t test-build frontend/Lastnext
   docker run --rm -it test-build sh
   
   # Inside container, check:
   cat next.config.mjs | grep "browserOnlyLibs"
   cat app/components/document/PDFMaintenanceGenerator.tsx | head -n 5
   ```

3. **Manual verification of files:**
   ```bash
   # Verify 'use client' directive was added
   grep -l "'use client'" frontend/Lastnext/app/components/document/*.tsx
   grep -l "'use client'" frontend/Lastnext/app/lib/*.ts
   
   # Should show these files:
   # - PDFMaintenanceGenerator.tsx
   # - JobsPDFGenerator.tsx
   # - ChartDashboardPDF.tsx
   # - JobPDFTemplate.tsx
   # - RoomTopicFilterPDF.tsx
   # - MaintenancePDFDocument.tsx
   # - pdfFonts.ts
   # - JobPDFService.ts
   ```

## Monitoring the Build

To watch the build process in real-time:

```bash
docker-compose build frontend 2>&1 | tee build.log
```

This will save the build output to `build.log` for analysis.

## Expected Build Time

- **With cache:** ~2-5 minutes
- **Without cache (--no-cache):** ~10-15 minutes

The Dockerfile includes automatic retries (3 attempts), so even if the first attempt fails, it will retry automatically.

## Verify the Running Container

After successful build and deployment:

```bash
# Check if container is running
docker-compose ps

# Check container logs
docker-compose logs -f frontend

# Test the application
curl -I http://localhost:3000
```

## Notes

- The fix involves webpack configuration changes and adding 'use client' directives
- No functional changes to PDF generation - it will work exactly as before
- All PDF-related features remain fully functional in the browser
- The fix only prevents browser-only code from being executed during server-side build

## Success Indicators

✅ Build completes without "self is not defined" error
✅ No retry attempts needed
✅ Application starts successfully
✅ PDF generation features work in the browser
✅ No console errors related to @react-pdf/renderer, jspdf, or html2canvas

