#!/bin/bash

echo "🔍 Debugging Media Files in Production Docker Setup"
echo "=================================================="

# Check if containers are running
echo "📋 Checking container status..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(nginx|backend|frontend)"

echo ""
echo "📁 Checking media volume contents..."
docker exec nginx ls -la /usr/share/nginx/html/media/ | head -20

echo ""
echo "🔗 Testing media file access..."
# Test if nginx can serve media files
docker exec nginx curl -I http://localhost/media/ 2>/dev/null || echo "❌ Cannot access media directory"

echo ""
echo "📊 Checking backend media directory..."
docker exec django-backend ls -la /app/media/ | head -20

echo ""
echo "🌐 Testing external media access..."
# Test from host
curl -I https://pcms.live/media/ 2>/dev/null || echo "❌ Cannot access media from external URL"

echo ""
echo "🔧 Checking nginx configuration..."
docker exec nginx nginx -t

echo ""
echo "📝 Checking environment variables..."
echo "NEXT_PUBLIC_MEDIA_URL: $(docker exec nextjs-frontend printenv NEXT_PUBLIC_MEDIA_URL 2>/dev/null || echo 'Not set')"
echo "NODE_ENV: $(docker exec nextjs-frontend printenv NODE_ENV 2>/dev/null || echo 'Not set')"

echo ""
echo "✅ Debug complete. Check the output above for any issues."
