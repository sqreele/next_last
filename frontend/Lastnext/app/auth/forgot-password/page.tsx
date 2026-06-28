'use client';

import { useState } from 'react';
import { postData } from '@/app/lib/api-client';
import Link from 'next/link';
import { ROUTES } from '@/app/lib/config';

export default function ForgotPasswordPage() {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setDevToken(null);

    try {
      const payload: Record<string, string> = emailOrUsername.includes('@')
        ? { email: emailOrUsername }
        : { username: emailOrUsername };

      const resp = await postData<{ message: string; token?: string }, Record<string, string>>(
        '/api/auth/password/forgot',
        payload
      );

      setMessage(resp.message || 'If an account exists, password reset instructions have been sent.');
      if (resp.token) setDevToken(resp.token);
    } catch (err: any) {
      setError(err?.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pcms-app-bg)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-7 rounded-[18px] border border-[var(--pcms-border)] bg-white/95 p-6 shadow-[var(--pcms-shadow)] sm:p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-[var(--pcms-text)]">Forgot Password</h2>
          <p className="mt-2 text-sm text-[var(--pcms-text-muted)]">
            Remembered it?{' '}
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
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
              Email or Username
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              required
              disabled={loading}
              className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--pcms-border)] px-3 py-2 text-gray-900 shadow-sm placeholder-gray-400 focus:border-[var(--pcms-primary)] focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 sm:text-sm"
              placeholder="Enter your email or username"
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
            {loading ? 'Sending...' : 'Send reset instructions'}
          </button>
        </form>

        {devToken && (
          <div className="text-sm text-gray-600 mt-4">
            <p className="mb-2">Developer token (for testing):</p>
            <code className="block p-2 bg-gray-100 rounded text-gray-800 break-all">{devToken}</code>
            <Link
              href={`${ROUTES.resetPassword}?token=${devToken}`}
              className="mt-2 inline-block text-[var(--pcms-primary)] hover:text-[var(--pcms-primary-hover)]"
            >
              Go to reset page with token
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
