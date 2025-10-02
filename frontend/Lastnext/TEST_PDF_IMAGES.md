# Quick Test Guide for PDF Image Export

## Run These Tests in Production Console

Open your browser console on https://pcms.live and run these commands:

### 1. Check Environment Detection
```javascript
console.log('=== Environment Detection ===');
console.log('Hostname:', window.location.hostname);
console.log('Is Production:', window.location.hostname.endsWith('pcms.live'));
console.log('Protocol:', window.location.protocol);
console.log('NODE_ENV:', process.env.NODE_ENV);
```

### 2. Test Media Base URL Detection
```javascript
// Simulate the getPdfMediaBaseUrl function
const testGetBaseUrl = () => {
  const hostname = window.location?.hostname;
  const isProduction = hostname?.endsWith('pcms.live');
  console.log('=== Base URL Detection ===');
  console.log('Hostname:', hostname);
  console.log('Is Production:', isProduction);
  if (isProduction) {
    console.log('✅ Should use: https://pcms.live');
    return 'https://pcms.live';
  }
  console.log('❌ Would fallback to:', 'http://localhost:8000');
  return 'http://localhost:8000';
};

const baseUrl = testGetBaseUrl();
console.log('Final Base URL:', baseUrl);
```

### 3. Test Image URL Resolution
```javascript
// Test URL resolution logic
const testImageUrls = [
  '/media/maintenance_job_images/test.jpg',
  'http://backend:8000/media/maintenance_job_images/test.jpg',
  'http://localhost:8000/media/maintenance_job_images/test.jpg',
  'https://pcms.live/media/maintenance_job_images/test.jpg',
  'maintenance_job_images/test.jpg'
];

console.log('=== URL Resolution Test ===');
const baseUrl = 'https://pcms.live';

testImageUrls.forEach(url => {
  let resolved;
  if (url.startsWith('http')) {
    try {
      const urlObj = new URL(url);
      const isInternal = /(^backend$)|(^localhost)|(^127\.0\.0\.1)/.test(urlObj.hostname) || urlObj.protocol === 'http:';
      const isMediaPath = urlObj.pathname.startsWith('/media/');
      if (isInternal && isMediaPath) {
        resolved = `${baseUrl}${urlObj.pathname}`;
      } else if (urlObj.hostname.endsWith('pcms.live') && urlObj.protocol !== 'https:') {
        resolved = `https://pcms.live${urlObj.pathname}`;
      } else {
        resolved = url;
      }
    } catch (e) {
      resolved = 'ERROR: ' + e.message;
    }
  } else {
    let path = url;
    if (!path.startsWith('/')) {
      path = path.startsWith('media/') ? `/${path}` : `/media/${path}`;
    }
    if (!path.startsWith('/media/')) {
      path = `/media${path}`;
    }
    resolved = `${baseUrl}${path}`;
  }
  console.log(`Input:  ${url}`);
  console.log(`Output: ${resolved}`);
  console.log('---');
});
```

### 4. Test CORS for Media Files
```javascript
// Test if media files are accessible with CORS
const testImageUrl = 'https://pcms.live/media/maintenance_job_images/test.jpg';

console.log('=== CORS Test ===');
console.log('Testing URL:', testImageUrl);

fetch(testImageUrl, { method: 'HEAD' })
  .then(response => {
    console.log('✅ Status:', response.status);
    console.log('CORS Headers:');
    console.log('  Allow-Origin:', response.headers.get('Access-Control-Allow-Origin'));
    console.log('  Allow-Methods:', response.headers.get('Access-Control-Allow-Methods'));
    console.log('  Allow-Headers:', response.headers.get('Access-Control-Allow-Headers'));
  })
  .catch(error => {
    console.log('❌ Error:', error.message);
  });

// Test with OPTIONS (preflight)
fetch(testImageUrl, { 
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://pcms.live',
    'Access-Control-Request-Method': 'GET'
  }
})
  .then(response => {
    console.log('✅ Preflight Status:', response.status);
    console.log('Preflight CORS Headers:');
    console.log('  Allow-Origin:', response.headers.get('Access-Control-Allow-Origin'));
    console.log('  Allow-Methods:', response.headers.get('Access-Control-Allow-Methods'));
  })
  .catch(error => {
    console.log('❌ Preflight Error:', error.message);
  });
```

### 5. Test Image Loading
```javascript
// Test if image can be loaded into an img element
const testImageLoad = (url) => {
  console.log('=== Image Load Test ===');
  console.log('Testing URL:', url);
  
  const img = new Image();
  img.crossOrigin = 'anonymous';
  
  img.onload = () => {
    console.log('✅ Image loaded successfully');
    console.log('Size:', img.width, 'x', img.height);
  };
  
  img.onerror = (e) => {
    console.log('❌ Image failed to load');
    console.log('Error:', e);
  };
  
  img.src = url;
  
  // Timeout after 5 seconds
  setTimeout(() => {
    if (!img.complete) {
      console.log('⏰ Image load timeout after 5 seconds');
    }
  }, 5000);
};

// Replace with actual image URL from your system
testImageLoad('https://pcms.live/media/maintenance_job_images/your-image.jpg');
```

### 6. Inspect Actual Job Data
```javascript
// Get the jobs data that's being used for PDF
// This assumes you have access to the jobs data in the component
// Run this in the context where jobs data is available

console.log('=== Job Data Inspection ===');

// If you can access the jobs array, inspect the first job:
const inspectJobImages = (job) => {
  console.log('Job ID:', job.job_id);
  console.log('Has images array:', !!job.images);
  console.log('Images array length:', job.images?.length || 0);
  console.log('Has image_urls array:', !!job.image_urls);
  console.log('Image URLs array length:', job.image_urls?.length || 0);
  
  if (job.images && job.images.length > 0) {
    console.log('First image object:');
    console.log(job.images[0]);
    console.log('  jpeg_url:', job.images[0]?.jpeg_url);
    console.log('  image_url:', job.images[0]?.image_url);
    console.log('  url:', job.images[0]?.url);
  }
  
  if (job.image_urls && job.image_urls.length > 0) {
    console.log('First image URL:', job.image_urls[0]);
  }
};

// Usage: inspectJobImages(jobs[0]);
```

## Expected Results in Production

### ✅ Correct Environment Detection
```
Hostname: pcms.live
Is Production: true
Protocol: https:
NODE_ENV: production
```

### ✅ Correct Base URL
```
✅ Should use: https://pcms.live
Final Base URL: https://pcms.live
```

### ✅ Working CORS
```
✅ Status: 200
CORS Headers:
  Allow-Origin: *
  Allow-Methods: GET, OPTIONS
  Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Authorization
```

### ✅ Successful Image Load
```
✅ Image loaded successfully
Size: 1024 x 768
```

## Common Issues and What They Mean

### ❌ CORS Error
```
Access to fetch at '...' has been blocked by CORS policy
```
**Problem**: Nginx is not configured with proper CORS headers
**Fix**: Update nginx configuration for `/media/` location

### ❌ 404 Not Found
```
GET https://pcms.live/media/... 404 (Not Found)
```
**Problem**: Image file doesn't exist or media volume not mounted
**Fix**: Check media files and Docker volume mounting

### ❌ Wrong Base URL
```
Would fallback to: http://localhost:8000
```
**Problem**: Environment detection failing
**Fix**: Check hostname detection logic

### ❌ No Image Data
```
Has images array: false
Images array length: 0
```
**Problem**: Jobs don't have image data from API
**Fix**: Check API endpoint and data serialization
