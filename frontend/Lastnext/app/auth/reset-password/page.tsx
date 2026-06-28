'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { postData } from '@/app/lib/api-client';
import Link from 'next/link';
import { ROUTES } from '@/app/lib/config';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get('token');
    if (t) setToken(t);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError('Reset token is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const resp = await postData<{ message: string }, { token: string; new_password: string }>(
        '/api/auth/password/reset',
        { token, new_password: password }
      );
      setMessage(resp.message || 'Password has been reset');
      // Redirect to login after brief delay
      setTimeout(() => router.push(ROUTES.signIn + '?reset=success'), 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pcms-app-bg)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-7 rounded-[18px] border border-[var(--pcms-border)] bg-white/95 p-6 shadow-[var(--pcms-shadow)] sm:p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-[var(--pcms-text)]">Reset Password</h2>
          <p className="mt-2 text-sm text-[var(--pcms-text-muted)]">
            Know your password?{' '}
            <Link href={ROUTES.signIn} className="font-semibold text-[var(--pcms-primary)] hover:text-[var(--pcms-primary-hover)]">
              Back to login
            </Link>
          </p>
        </div>

        {message && (
          <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm">{message}</div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700">
              Reset Token
            </label>
            <input
              id="token"
              name="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              disabled={loading}
              className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--pcms-border)] px-3 py-2 text-gray-900 shadow-sm placeholder-gray-400 focus:border-[var(--pcms-primary)] focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 sm:text-sm"
              placeholder="Paste your reset token"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--pcms-border)] px-3 py-2 text-gray-900 shadow-sm placeholder-gray-400 focus:border-[var(--pcms-primary)] focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 sm:text-sm"
              placeholder="Enter a new password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--pcms-border)] px-3 py-2 text-gray-900 shadow-sm placeholder-gray-400 focus:border-[var(--pcms-primary)] focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 sm:text-sm"
              placeholder="Re-enter the new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`flex min-h-11 w-full justify-center rounded-full border border-transparent px-4 py-2 text-sm font-semibold text-white shadow-[var(--pcms-button-shadow)] ${
              loading
                ? 'cursor-not-allowed bg-blue-400'
                : 'bg-[var(--pcms-primary)] hover:bg-[var(--pcms-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2'
            }`}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--pcms-app-bg)] px-4 py-12 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-8 rounded-[18px] border border-[var(--pcms-border)] bg-white p-8 shadow-[var(--pcms-shadow)]">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-800">Loading...</h2>
            </div>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
