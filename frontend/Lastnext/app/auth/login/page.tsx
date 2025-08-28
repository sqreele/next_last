'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AuthLoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth0Login = async () => {
    setIsLoading(true);
    try {
      // Redirect to Auth0 login
      window.location.href = '/api/auth/[...auth0]?action=login';
    } catch (error) {
      console.error('Login error:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Access your maintenance dashboard
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div>
            <button
              onClick={handleAuth0Login}
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span>Redirecting to Auth0...</span>
              ) : (
                <span>Sign in with Auth0</span>
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link href="/auth/register" className="font-medium text-indigo-600 hover:text-indigo-500">
                Sign up
              </Link>
            </p>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">
              You will be redirected to Auth0 to complete your sign-in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
