// app/lib/debug-config.ts
export function debugConfig() {
  const config = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    AUTH0_SECRET: process.env.AUTH0_SECRET ? 'SET' : 'NOT_SET',
    AUTH0_BASE_URL: process.env.AUTH0_BASE_URL,
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
  };

  console.log('🔧 Environment Configuration Debug:', config);
  
  // Check for common issues
  const issues = [];
  
  if (!process.env.AUTH0_SECRET) {
    issues.push('❌ AUTH0_SECRET is not set');
  }
  
  if (!process.env.NEXT_PUBLIC_API_URL) {
    issues.push('❌ NEXT_PUBLIC_API_URL is not set');
  }
  
  if (!process.env.DATABASE_URL) {
    issues.push('❌ DATABASE_URL is not set');
  }
  
  if (issues.length > 0) {
    console.error('🚨 Configuration Issues Found:', issues);
  } else {
    console.log('✅ Configuration looks good');
  }
  
  return { config, issues };
}

export function debugApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 
    (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "https://pcms.live");
  
  console.log('🌐 API URL Configuration:', {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NODE_ENV: process.env.NODE_ENV,
    resolvedUrl: apiUrl,
  });
  
  return apiUrl;
} 