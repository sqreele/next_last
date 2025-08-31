'use client';

import React from 'react';
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';
import { AuthErrorBoundary } from '@/app/components/auth/AuthErrorBoundary';
import ImprovedDashboard from './ImprovedDashboard';

export default function DashboardWithAuth() {
  return (
    <AuthErrorBoundary>
      <ProtectedRoute
        requireAuth={true}
        redirectTo="/auth/login"
        showLoadingSpinner={true}
      >
        <ImprovedDashboard />
      </ProtectedRoute>
    </AuthErrorBoundary>
  );
}
