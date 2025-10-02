# Nginx Media CORS Fix for Production PDF Images

## 🎯 **Problem Identified**

Images were not showing in job PDF exports in production because the nginx `/media/` location block was missing proper CORS headers required for PDF generation.

## 🔍 **Root Cause**

The PDF generation process in `@react-pdf/renderer` makes cross-origin requests to load images. The browser blocks these requests due to CORS policy when the server doesn't provide the necessary headers.

### **Original Configuration (Problematic)**
```nginx
location /media/ {
    alias /usr/share/nginx/html/media/;
    expires 30d;
    access_log off;
    add_header Cache-Control "public, no-transform";
    add_header Access-Control-Allow-Origin *;
    autoindex off;
}
```

**Issues:**
- ❌ Missing `Access-Control-Allow-Methods`
- ❌ Missing `Access-Control-Allow-Headers`
- ❌ No OPTIONS method handling for preflight requests
- ❌ Missing `always` directive for error responses

## ✅ **Solution Implemented**

### **Updated Configuration (Fixed)**
```nginx
location /media/ {
    alias /usr/share/nginx/html/media/;
    expires 30d;
    access_log off;
    add_header Cache-Control "public, no-transform";
    
    # CORS headers for PDF generation
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;
    add_header Access-Control-Max-Age 86400 always;
    
    # Handle preflight requests for PDF generation
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;
        add_header Access-Control-Max-Age 86400 always;
        add_header Content-Length 0 always;
        add_header Content-Type text/plain always;
        return 204;
    }
    
    autoindex off;
}
```

## 🔧 **Key Changes Made**

### **1. Complete CORS Headers**
- ✅ `Access-Control-Allow-Origin *` - Allows cross-origin requests
- ✅ `Access-Control-Allow-Methods "GET, OPTIONS"` - Allows GET and OPTIONS methods
- ✅ `Access-Control-Allow-Headers` - Allows necessary headers for PDF generation
- ✅ `Access-Control-Max-Age 86400` - Caches preflight responses for 24 hours

### **2. Preflight Request Handling**
- ✅ OPTIONS method handling for browser preflight requests
- ✅ Returns 204 status for successful preflight
- ✅ Proper Content-Length and Content-Type headers

### **3. Always Directive**
- ✅ `always` directive ensures headers are sent even for error responses
- ✅ Critical for PDF generation which may encounter 404s or other errors

## 📋 **CORS Headers Explained**

| Header | Purpose | Value |
|--------|---------|-------|
| `Access-Control-Allow-Origin` | Allows cross-origin requests | `*` (allows all origins) |
| `Access-Control-Allow-Methods` | Allowed HTTP methods | `GET, OPTIONS` |
| `Access-Control-Allow-Headers` | Allowed request headers | Standard headers for PDF generation |
| `Access-Control-Max-Age` | Preflight cache duration | `86400` (24 hours) |

## 🚀 **How to Apply the Fix**

### **1. Update Nginx Configuration**
```bash
# Edit the nginx configuration file
nano /home/sqreele/next_last/nginx/conf.d/pcms.live.ssl.conf

# Or use the updated file that's already been modified
```

### **2. Test Nginx Configuration**
```bash
# Test nginx configuration syntax
docker exec nginx nginx -t

# If successful, reload nginx
docker exec nginx nginx -s reload
```

### **3. Restart Nginx Container (if needed)**
```bash
# Restart the nginx container to apply changes
docker-compose restart nginx
```

## 🧪 **Testing the Fix**

### **1. Test CORS Headers**
```bash
# Test preflight request
curl -X OPTIONS \
  -H "Origin: https://pcms.live" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v https://pcms.live/media/test-image.jpg
```

**Expected Response:**
```
HTTP/2 204
access-control-allow-origin: *
access-control-allow-methods: GET, OPTIONS
access-control-allow-headers: Origin, X-Requested-With, Content-Type, Accept, Authorization
access-control-max-age: 86400
```

### **2. Test Image Access**
```bash
# Test actual image request
curl -I https://pcms.live/media/maintenance_job_images/your-image.jpg
```

**Expected Response:**
```
HTTP/2 200
access-control-allow-origin: *
access-control-allow-methods: GET, OPTIONS
access-control-allow-headers: Origin, X-Requested-With, Content-Type, Accept, Authorization
content-type: image/jpeg
```

### **3. Test PDF Generation**
- Generate a job PDF in production
- Check browser console for CORS errors
- Verify images appear in the PDF

## 🔍 **Troubleshooting**

### **Images Still Not Showing**

1. **Check Browser Console**
   - Look for CORS errors
   - Check for 404 errors on image URLs
   - Verify network requests are successful

2. **Verify Nginx Configuration**
   ```bash
   # Check nginx is running with new config
   docker exec nginx nginx -t
   
   # Check nginx error logs
   docker logs nginx
   ```

3. **Test Image URLs Manually**
   ```bash
   # Test if specific image is accessible
   curl -I https://pcms.live/media/maintenance_job_images/specific-image.jpg
   ```

### **Common Issues**

1. **Nginx Not Reloaded**: Configuration changes require nginx reload
2. **File Permissions**: Media files must be readable by nginx
3. **Docker Volumes**: Ensure media volume is properly mounted
4. **SSL Issues**: Ensure HTTPS is working correctly

## ✅ **Expected Results**

After applying this fix:

1. ✅ **Images show in production PDFs**
2. ✅ **No CORS errors in browser console**
3. ✅ **Preflight requests return 204 status**
4. ✅ **Image requests include proper CORS headers**
5. ✅ **PDF generation works consistently**

## 📁 **Files Modified**

- **`nginx/conf.d/pcms.live.ssl.conf`**: Updated `/media/` location block with proper CORS headers

## 🎉 **Summary**

The issue was that nginx wasn't providing the necessary CORS headers for PDF generation to access media files. The fix adds complete CORS support including preflight request handling, which allows the PDF generation process to successfully load images from the `/media/` directory in production.

This fix works in conjunction with the existing image URL resolution logic in the frontend code to ensure images display correctly in both development and production environments.
