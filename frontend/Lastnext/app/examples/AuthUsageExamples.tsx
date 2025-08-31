'use client';

import React from 'react';
import { withAuth, AuthWrapper } from '@/app/lib/utils/withAuth';
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';

// Example 1: Using the ProtectedRoute component directly
export const ExamplePage1: React.FC = () => {
  return (
    <ProtectedRoute requireAuth={true} redirectTo="/auth/login">
      <div>
        <h1>This page is protected</h1>
        <p>Only authenticated users can see this content.</p>
      </div>
    </ProtectedRoute>
  );
};

// Example 2: Using the withAuth HOC
const UnprotectedComponent: React.FC = () => (
  <div>
    <h1>This component will be wrapped with auth</h1>
    <p>It's now protected automatically.</p>
  </div>
);

export const ExamplePage2 = withAuth(UnprotectedComponent, {
  requireAuth: true,
  redirectTo: '/auth/login',
  showLoadingSpinner: true,
});

// Example 3: Using the AuthWrapper component
export const ExamplePage3: React.FC = () => {
  return (
    <AuthWrapper requireAuth={true} redirectTo="/auth/login">
      <div>
        <h1>Protected with AuthWrapper</h1>
        <p>Simple and clean protection.</p>
      </div>
    </AuthWrapper>
  );
};

// Example 4: Using the useSessionGuard hook directly
export const ExamplePage4: React.FC = () => {
  const { isAuthenticated, isLoading, user, redirectToLogin } = useSessionGuard({
    requireAuth: true,
    redirectTo: '/auth/login',
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <h1>Access Denied</h1>
        <button onClick={redirectToLogin}>Go to Login</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {user?.username}!</h1>
      <p>You are authenticated and can see this content.</p>
    </div>
  );
};

// Example 5: Conditional authentication based on user role
export const ExamplePage5: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useSessionGuard({
    requireAuth: true,
    redirectTo: '/auth/login',
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return null; // Will redirect automatically
  }

  // Check user role
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';

  return (
    <div>
      <h1>Role-based Access</h1>
      
      {isAdmin && (
        <div>
          <h2>Admin Panel</h2>
          <p>Only admins can see this content.</p>
        </div>
      )}
      
      {isManager && (
        <div>
          <h2>Manager Panel</h2>
          <p>Managers can see this content.</p>
        </div>
      )}
      
      <div>
        <h2>General Content</h2>
        <p>All authenticated users can see this.</p>
      </div>
    </div>
  );
};

// Example 6: Public page with optional authentication
export const ExamplePage6: React.FC = () => {
  const { isAuthenticated, user } = useSessionGuard({
    requireAuth: false, // Don't require auth
    showToast: false, // Don't show toast messages
  });

  return (
    <div>
      <h1>Public Page</h1>
      <p>Anyone can see this content.</p>
      
      {isAuthenticated ? (
        <div>
          <h2>Welcome back, {user?.username}!</h2>
          <p>You have access to additional features.</p>
          <button>View Dashboard</button>
        </div>
      ) : (
        <div>
          <h2>Guest User</h2>
          <p>Log in to access more features.</p>
          <button>Login</button>
        </div>
      )}
    </div>
  );
};

// Example 7: Custom unauthorized handler
export const ExamplePage7: React.FC = () => {
  const { isAuthenticated, isLoading } = useSessionGuard({
    requireAuth: true,
    onUnauthorized: () => {
      // Custom handling instead of automatic redirect
      console.log('User is not authorized');
      // You could show a modal, update state, etc.
    },
    showToast: false,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <h1>Custom Unauthorized Handler</h1>
        <p>This page uses a custom unauthorized handler instead of automatic redirect.</p>
        <button onClick={() => window.location.href = '/auth/login'}>
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Protected Content</h1>
      <p>You are authenticated!</p>
    </div>
  );
};

// Example 8: Page with different auth requirements for different sections
export const ExamplePage8: React.FC = () => {
  return (
    <div>
      <h1>Mixed Authentication Page</h1>
      
      {/* Public section */}
      <div>
        <h2>Public Information</h2>
        <p>Anyone can see this content.</p>
      </div>
      
      {/* Protected section */}
      <ProtectedRoute requireAuth={true} redirectTo="/auth/login">
        <div>
          <h2>Protected Information</h2>
          <p>Only authenticated users can see this.</p>
        </div>
      </ProtectedRoute>
      
      {/* Admin-only section */}
      <ProtectedRoute requireAuth={true} redirectTo="/auth/login">
        <AdminOnlyContent />
      </ProtectedRoute>
    </div>
  );
};

// Admin-only component
const AdminOnlyContent: React.FC = () => {
  const { user } = useSessionGuard({ requireAuth: true });
  
  if (user?.role !== 'admin') {
    return (
      <div>
        <h3>Admin Section</h3>
        <p>Access denied. Admin privileges required.</p>
      </div>
    );
  }
  
  return (
    <div>
      <h3>Admin Section</h3>
      <p>Welcome, Admin! You have access to sensitive information.</p>
    </div>
  );
};

// Example 9: Error boundary with authentication
export const ExamplePage9: React.FC = () => {
  return (
    <ProtectedRoute requireAuth={true} redirectTo="/auth/login">
      <div>
        <h1>Page with Error Boundary</h1>
        <p>This page is wrapped with both authentication and error boundaries.</p>
        <button onClick={() => {
          throw new Error('This is a test error');
        }}>
          Trigger Error
        </button>
      </div>
    </ProtectedRoute>
  );
};

// Example 10: Lazy loading with authentication
export const ExamplePage10: React.FC = () => {
  const [showProtectedContent, setShowProtectedContent] = React.useState(false);
  
  return (
    <div>
      <h1>Lazy Authentication</h1>
      <p>Content is loaded only when needed.</p>
      
      <button onClick={() => setShowProtectedContent(true)}>
        Load Protected Content
      </button>
      
      {showProtectedContent && (
        <ProtectedRoute requireAuth={true} redirectTo="/auth/login">
          <div>
            <h2>Protected Content Loaded</h2>
            <p>This content was loaded on demand.</p>
          </div>
        </ProtectedRoute>
      )}
    </div>
  );
};

export default ExamplePage1;
