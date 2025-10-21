// @ts-check
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(projectRoot, '..', '..')
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Temporarily disable standalone output for Docker build
  // output: 'standalone',
  
  // ✅ PERFORMANCE: Enable compression
  compress: true,
  
  // ✅ PERFORMANCE: Enable production optimizations
  productionBrowserSourceMaps: false, // Disable source maps in production for smaller bundle
  
  // ✅ PERFORMANCE: Optimize power preference
  poweredByHeader: false,
  
  images: {
    formats: ['image/avif', 'image/webp'], // ✅ PERFORMANCE: Add WebP fallback
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // ✅ PERFORMANCE: 1 year cache
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox; img-src 'self' data: blob: https: http://localhost:8000 http://127.0.0.1:8000;",
    loader: 'default',
    unoptimized: false,
    remotePatterns: [
      // Development - local machine
      { protocol: 'http', hostname: '127.0.0.1', port: '8000', pathname: '/media/**' },
      { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/media/**' },
      { protocol: 'http', hostname: '0.0.0.0', port: '8000', pathname: '/media/**' },
      // Production
      { protocol: 'https', hostname: 'pcms.live', port: '', pathname: '/media/**' },
      { protocol: 'https', hostname: 'www.pcms.live', port: '', pathname: '/media/**' },
      // Docker networking
      { protocol: 'http', hostname: 'backend', port: '8000', pathname: '/media/**' },
      { protocol: 'http', hostname: 'django-backend', port: '8000', pathname: '/media/**' },
      { protocol: 'http', hostname: 'backend', port: '', pathname: '/media/**' },
      // Allow all localhost variations
      { protocol: 'http', hostname: 'localhost', port: '', pathname: '/media/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '', pathname: '/media/**' },
      // Google OAuth profile images
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'lh5.googleusercontent.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'lh6.googleusercontent.com', port: '', pathname: '/**' },
    ],
  },
  
  eslint: {
    ignoreDuringBuilds: true, // Remove this once ESLint issues are fixed
  },
  
  trailingSlash: true, // Optional, depending on your backend
  
  env: {
    // Only expose non-sensitive envs to the client
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
    NEXT_PUBLIC_LOGIN_ROUTE: process.env.NEXT_PUBLIC_LOGIN_ROUTE,
    NEXT_PUBLIC_PROFILE_ROUTE: process.env.NEXT_PUBLIC_PROFILE_ROUTE,
    NEXT_PUBLIC_ACCESS_TOKEN_ROUTE: process.env.NEXT_PUBLIC_ACCESS_TOKEN_ROUTE,
  },
  
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // Silence workspace root inference issues in monorepo-ish layout
  outputFileTracingRoot: repoRoot,
  
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: process.env.AUTH0_BASE_URL || 'https://pcms.live' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
  
  experimental: {
    // ✅ Fixed: serverActions must be an object in Next.js 15+
    serverActions: {},
    // Disabled optimizePackageImports to avoid build-time TypeError in Next 15.5+
    // optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-icons'],
  },
  
  // ✅ PERFORMANCE: Enable React compiler optimizations
  reactStrictMode: true,
  
  async redirects() {
    return [
      {
        source: '/profile',
        destination: '/dashboard/profile',
        permanent: true,
      },
      {
        source: '/profile/',
        destination: '/dashboard/profile/',
        permanent: true,
      },
      {
        source: '/auth/profile',
        destination: '/dashboard/profile',
        permanent: true,
      },
      {
        source: '/auth/profile/',
        destination: '/dashboard/profile/',
        permanent: true,
      },
      {
        source: '/dashboard/chartdashboad/',
        destination: '/dashboard/chartdashboard/',
        permanent: true,
      },
      {
        source: '/dashboard/chartdashboad',
        destination: '/dashboard/chartdashboard/',
        permanent: true,
      },
    ];
  },
  
  // Ensure webpack resolves the '@' alias to the project root
  webpack: (config, { isServer, dev }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@'] = projectRoot;
    
    // ✅ FIX: Exclude browser-only libraries from server-side bundle
    if (isServer) {
      const existingExternals = config.externals;

      const browserOnlyLibs = [
        '@react-pdf/renderer',
        'jspdf',
        'html2canvas',
        'canvas',
        'jsdom',
        'file-saver',
      ];

      // Webpack externals signature varies; support both ({context, request}, cb) and (context, request, cb)
      /** @param {any} arg1 @param {any} arg2 @param {any} arg3 */
      const handleExternals = (arg1, arg2, arg3) => {
        /** @type {{ context?: string, request?: string }} */
        const first = arg1;
        /** @type {string | undefined} */
        const maybeRequest = typeof arg1 === 'string' ? arg1 : arg2;
        /** @type {(err?: any, result?: any) => void} */
        const callback = typeof arg3 === 'function' ? arg3 : arg2;
        const request = maybeRequest;
        try {
          if (
            request &&
            browserOnlyLibs.some(
              (lib) => request === lib || (typeof request === 'string' && request.startsWith(`${lib}/`))
            )
          ) {
            return callback(null, 'commonjs ' + request);
          }

          if (typeof existingExternals === 'function') {
            // try both signatures
            if (first && typeof first === 'object' && 'context' in first) {
              return existingExternals(first, callback);
            }
            return existingExternals(undefined, request, callback);
          }

          return callback();
        } catch (error) {
          return callback(error);
        }
      };

      if (Array.isArray(existingExternals)) {
        config.externals = [...existingExternals, handleExternals];
      } else if (existingExternals) {
        config.externals = [existingExternals, handleExternals];
      } else {
        config.externals = [handleExternals];
      }
    }
    
    // ✅ PERFORMANCE: Add optimization settings (client-only)
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk for node_modules
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20
            },
            // Common chunks used across multiple pages
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true
            },
            // Large libraries get their own chunks
            recharts: {
              test: /[\\/]node_modules[\\/](recharts|d3-.*)[\\/]/,
              name: 'recharts',
              priority: 30,
            },
            reactPdf: {
              test: /[\\/]node_modules[\\/](@react-pdf|react-pdf)[\\/]/,
              name: 'react-pdf',
              priority: 30,
            },
            radix: {
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              name: 'radix-ui',
              priority: 25,
            }
          }
        }
      };
    }
    
    // Handle @react-pdf/renderer for client-side rendering
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        process: false,
      };
    }
    
    // Ensure proper module resolution for @react-pdf/renderer
    config.resolve.extensions = [...(config.resolve.extensions || []), '.js', '.jsx', '.ts', '.tsx'];
    
    return config;
  },
  
  async rewrites() {
    const privateApi = process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
    const mediaApi = process.env.NEXT_MEDIA_API_URL || 'http://localhost:8000';
    
    // In production, don't proxy media files - let nginx handle them directly
    if (process.env.NODE_ENV === 'production') {
      return [
        // Do NOT proxy Auth0 endpoints; let Next.js handle them
        {
          source: '/auth/:path*',
          destination: '/auth/:path*',
        },
        // Pass-through for already versioned API calls
        {
          source: '/api/v1/:path*',
          destination: `${privateApi}/api/v1/:path*`,
        },
        // Proxy specific backend API endpoints (only rewrite what we need)
        {
          source: '/api/users/:path*',
          destination: `${privateApi}/api/v1/users/:path*`,
        },
        // Note: /api/preventive-maintenance is now handled by Next.js API routes
        {
          source: '/internal-api/:path*',
          destination: 'http://backend:8000/:path*',
        },
      ];
    }
    
    // Development rewrites
    return [
      // Do NOT proxy Auth0 endpoints; let Next.js handle them
      {
        source: '/auth/:path*',
        destination: '/auth/:path*',
      },
      // Proxy media files to backend for image optimization
      {
        source: '/media/:path*',
        destination: `${mediaApi}/media/:path*`,
      },
      // Pass-through for already versioned API calls
      {
        source: '/api/v1/:path*',
        destination: `${privateApi}/api/v1/:path*`,
      },
      // Proxy specific backend API endpoints (only rewrite what we need)
      {
        source: '/api/users/:path*',
        destination: `${privateApi}/api/v1/users/:path*`,
      },
      // Note: /api/preventive-maintenance is now handled by Next.js API routes
      {
        source: '/internal-api/:path*',
        destination: 'http://backend:8000/:path*',
      },
    ];
  },
};

export default nextConfig;
