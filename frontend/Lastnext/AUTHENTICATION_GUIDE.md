# 🔐 Authentication System Implementation Guide

## Overview
This guide covers the comprehensive authentication system implemented across all pages in your Next.js application, including automatic session checking, error handling, and redirects to the login page.

## 🏗️ Architecture Components

### 1. **Session Guard Hook** (`/lib/hooks/useSessionGuard.ts`)
- **Purpose**: Centralized authentication logic for components
- **Features**: Automatic redirects, error handling, loading states
- **Usage**: Wrap any component that needs authentication

### 2. **Protected Route Component** (`/components/auth/ProtectedRoute.tsx`)
- **Purpose**: Component wrapper for route-level protection
- **Features**: Loading states, unauthorized fallbacks, custom redirects
- **Usage**: Wrap page components or sections

### 3. **Error Boundary** (`/components/auth/AuthErrorBoundary.tsx`)
- **Purpose**: Catch and handle authentication errors gracefully
- **Features**: Automatic error detection, user-friendly error messages
- **Usage**: Wrap entire pages or app sections

### 4. **Next.js Middleware** (`/middleware.ts`)
- **Purpose**: Route-level authentication at the server level
- **Features**: Automatic redirects, API protection, performance optimization
- **Usage**: Automatically applied to all routes

## 🚀 Quick Start

### **Public vs Protected Routes**
- **Public Routes**: Root page (`/`), auth pages, about, contact - no authentication required
- **Protected Routes**: Dashboard, jobs, maintenance - require valid session
- **Automatic Detection**: Middleware automatically identifies route types

### **Basic Page Protection**
```typescript
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';

export default function MyProtectedPage() {
  return (
    <ProtectedRoute requireAuth={true} redirectTo="/auth/login">
      <div>This content is protected</div>
    </ProtectedRoute>
  );
}
```

### **Using the Hook**
```typescript
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';

export default function MyPage() {
  const { isAuthenticated, isLoading, user } = useSessionGuard();
  
  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return null; // Auto-redirects
  
  return <div>Welcome, {user?.username}!</div>;
}
```

### **Higher-Order Component**
```typescript
import { withAuth } from '@/app/lib/utils/withAuth';

const MyComponent = () => <div>Protected content</div>;

export default withAuth(MyComponent, {
  requireAuth: true,
  redirectTo: '/auth/login'
});
```

## 📱 Implementation Examples

### **Dashboard Page Protection**
```typescript
// /app/dashboard/page.tsx
import DashboardWithAuth from './DashboardWithAuth';

export default function DashboardPage() {
  return <DashboardWithAuth />;
}
```

### **Individual Component Protection**
```typescript
// /app/components/SomeComponent.tsx
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';

export default function SomeComponent() {
  return (
    <ProtectedRoute requireAuth={true}>
      <div>Protected component content</div>
    </ProtectedRoute>
  );
}
```

### **Conditional Authentication**
```typescript
// /app/components/ConditionalAuth.tsx
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';

export default function ConditionalAuth() {
  const { isAuthenticated, user } = useSessionGuard({ requireAuth: false });
  
  return (
    <div>
      <h1>Public Content</h1>
      {isAuthenticated && (
        <div>
          <h2>Private Content for {user?.username}</h2>
        </div>
      )}
    </div>
  );
}
```

## ⚙️ Configuration Options

### **ProtectedRoute Props**
```typescript
interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;        // Default: true
  redirectTo?: string;          // Default: '/auth/login'
  fallback?: ReactNode;         // Custom loading/error UI
  showLoadingSpinner?: boolean; // Default: true
  onUnauthorized?: () => void;  // Custom unauthorized handler
}
```

### **useSessionGuard Options**
```typescript
interface UseSessionGuardOptions {
  redirectTo?: string;          // Default: '/auth/login'
  requireAuth?: boolean;        // Default: true
  onUnauthorized?: () => void;  // Custom handler
  showToast?: boolean;          // Default: true
}
```

### **Middleware Configuration**
```typescript
// /middleware.ts
const protectedRoutes = [
  '/dashboard',
  '/jobs',
  '/preventive-maintenance',
  '/rooms',
  '/profile'
];

const protectedApiRoutes = [
  '/api/v1/jobs',
  '/api/v1/properties',
  '/api/v1/rooms'
];
```

## 🔒 Security Features

### **Automatic Session Validation**
- ✅ Token expiration checking
- ✅ Automatic redirect on auth failure
- ✅ Session state synchronization
- ✅ Secure token storage

### **Error Handling**
- ✅ Authentication error detection
- ✅ User-friendly error messages
- ✅ Automatic error recovery
- ✅ Development debugging support

### **Route Protection**
- ✅ Server-side middleware protection
- ✅ Client-side component protection
- ✅ API route protection
- ✅ Public route handling

## 📊 Performance Optimizations

### **Caching Strategy**
- ✅ Session state caching
- ✅ Route protection caching
- ✅ Error boundary optimization
- ✅ Lazy loading support

### **Loading States**
- ✅ Skeleton loading screens
- ✅ Progress indicators
- ✅ Smooth transitions
- ✅ User feedback

## 🎯 Use Cases

### **1. Full Page Protection**
```typescript
// Protect entire pages
export default function AdminPage() {
  return (
    <ProtectedRoute requireAuth={true} redirectTo="/auth/login">
      <AdminDashboard />
    </ProtectedRoute>
  );
}
```

### **2. Section-Level Protection**
```typescript
// Protect specific sections
export default function MixedPage() {
  return (
    <div>
      <h1>Public Header</h1>
      
      <ProtectedRoute requireAuth={true}>
        <AdminPanel />
      </ProtectedRoute>
      
      <PublicFooter />
    </div>
  );
}
```

### **3. Role-Based Access**
```typescript
// Conditional access based on user role
export default function RoleBasedPage() {
  const { user } = useSessionGuard({ requireAuth: true });
  
  return (
    <div>
      {user?.role === 'admin' && <AdminContent />}
      {user?.role === 'manager' && <ManagerContent />}
      <UserContent />
    </div>
  );
}
```

### **4. Public Landing Page**
```typescript
// Root page (/) - accessible to everyone
export default function LandingPage() {
  const { isAuthenticated, user } = useSessionGuard({ requireAuth: false });
  
  return (
    <div>
      <h1>Welcome to MaintenancePro</h1>
      {isAuthenticated ? (
        <DashboardLink user={user} />
      ) : (
        <LoginButton />
      )}
    </div>
  );
}
```

**Features:**
- **No Authentication Required**: Anyone can visit `http://localhost:3000/`
- **Smart Navigation**: Shows different content for authenticated vs guest users
- **Beautiful Design**: Modern landing page with features showcase
- **Seamless Experience**: Easy navigation to dashboard or login

## 🚨 Error Handling

### **Authentication Errors**
- **401 Unauthorized**: Session expired, redirect to login
- **403 Forbidden**: Insufficient permissions
- **Network Errors**: Automatic retry with exponential backoff
- **Token Errors**: Automatic token refresh

### **User Experience**
- **Loading States**: Clear feedback during authentication
- **Error Messages**: User-friendly error descriptions
- **Recovery Options**: Retry buttons and alternative actions
- **Redirect Handling**: Smooth navigation to login

## 🔧 Customization

### **Custom Error UI**
```typescript
const CustomErrorUI = () => (
  <div className="custom-error">
    <h2>Access Denied</h2>
    <p>Please log in to continue</p>
  </div>
);

<ProtectedRoute fallback={<CustomErrorUI />}>
  <ProtectedContent />
</ProtectedRoute>
```

### **Custom Loading UI**
```typescript
const CustomLoadingUI = () => (
  <div className="custom-loading">
    <Spinner />
    <p>Verifying your session...</p>
  </div>
);

<ProtectedRoute fallback={<CustomLoadingUI />}>
  <ProtectedContent />
</ProtectedRoute>
```

### **Custom Redirect Logic**
```typescript
const CustomUnauthorizedHandler = () => {
  // Show modal instead of redirecting
  showLoginModal();
};

<ProtectedRoute onUnauthorized={CustomUnauthorizedHandler}>
  <ProtectedContent />
</ProtectedRoute>
```

## 📱 Mobile & Responsive

### **Mobile Optimization**
- ✅ Touch-friendly error buttons
- ✅ Responsive error layouts
- ✅ Mobile-optimized loading states
- ✅ Touch gesture support

### **Accessibility**
- ✅ ARIA labels and descriptions
- ✅ Keyboard navigation support
- ✅ Screen reader compatibility
- ✅ Focus management

## 🧪 Testing

### **Unit Tests**
```bash
# Test authentication hooks
npm run test:unit -- --testPathPattern=useSessionGuard

# Test protected route components
npm run test:unit -- --testPathPattern=ProtectedRoute

# Test error boundaries
npm run test:unit -- --testPathPattern=AuthErrorBoundary
```

### **Integration Tests**
```bash
# Test authentication flow
npm run test:integration -- --testPathPattern=auth

# Test protected routes
npm run test:integration -- --testPathPattern=protected
```

### **E2E Tests**
```bash
# Test complete authentication flow
npm run test:e2e -- --spec="auth-flow.spec.ts"

# Test error scenarios
npm run test:e2e -- --spec="auth-errors.spec.ts"
```

## 🚀 Deployment

### **Environment Variables**
```bash
# Required
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://yourdomain.com

# Optional
AUTH_REDIRECT_URL=/auth/login
AUTH_ERROR_PAGE=/auth/error
AUTH_SUCCESS_PAGE=/dashboard
```

### **Build Optimization**
```bash
# Production build
npm run build

# Analyze bundle
npm run analyze

# Start production server
npm start
```

## 🔮 Future Enhancements

### **Planned Features**
- **Multi-factor Authentication**: SMS, email, TOTP support
- **Social Login**: Google, Facebook, GitHub integration
- **Session Management**: Multiple device handling
- **Advanced Permissions**: Granular role-based access

### **Performance Improvements**
- **Service Worker**: Offline authentication support
- **WebSocket**: Real-time session updates
- **Progressive Web App**: Native app-like experience
- **Background Sync**: Automatic token refresh

## 📚 Additional Resources

- [Next.js Authentication](https://nextjs.org/docs/authentication)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Session Management](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Security Best Practices](https://owasp.org/www-project-top-ten/)

## 🤝 Support

For questions or issues with the authentication system:

1. **Check the examples** in `/app/examples/AuthUsageExamples.tsx`
2. **Review the documentation** in this guide
3. **Check the console** for error messages
4. **Verify your configuration** in `/lib/config.ts`

---

**Last Updated**: January 2024  
**Version**: 1.0.0  
**Maintainer**: Development Team
