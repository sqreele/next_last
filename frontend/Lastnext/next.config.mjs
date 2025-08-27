// @ts-check
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Temporarily disable standalone output for Docker build
  // output: 'standalone',
  
  images: {
    formats: ['image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
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
      // Allow all localhost variations
      { protocol: 'http', hostname: 'localhost', port: '', pathname: '/media/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '', pathname: '/media/**' },
    ],
  },
  
  eslint: {
    ignoreDuringBuilds: true, // Remove this once ESLint issues are fixed
  },
  
  trailingSlash: true, // Optional, depending on your backend
  
  env: {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXTAUTH_URL || 'https://pcms.live' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
  
  experimental: {
    // ✅ Fixed: serverActions must be an object in Next.js 15+
    serverActions: {},
  },
  
  async redirects() {
    return [
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
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@'] = projectRoot;
    
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
    return [
      // Do NOT proxy NextAuth endpoints; let Next.js handle them
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
      // Proxy media files to backend for image optimization
      {
        source: '/media/:path*',
        destination: `${privateApi}/media/:path*`,
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
      {
        source: '/api/user-profiles/:path*',
        destination: `${privateApi}/api/v1/user-profiles/:path*`,
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
