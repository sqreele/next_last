'use client';

import { useUser } from '@auth0/nextjs-auth0';

export default function ProfilePage() {
  const { user, error, isLoading } = useUser();

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error.message}</div>;
  if (!user) return <div className="p-6">Not authenticated</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      {user.picture && (
        <img src={user.picture} alt={user.name || 'user'} width={72} height={72} />
      )}
      <div className="text-sm">
        <div><strong>Name:</strong> {user.name}</div>
        <div><strong>Email:</strong> {user.email}</div>
        <pre className="mt-2 p-3 bg-gray-100 rounded overflow-auto text-xs">{JSON.stringify(user, null, 2)}</pre>
      </div>
      <a href="/auth/logout" className="inline-block px-4 py-2 bg-gray-200 rounded">Log out</a>
    </div>
  );
}

