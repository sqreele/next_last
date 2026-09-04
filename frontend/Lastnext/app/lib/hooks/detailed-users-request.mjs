export async function requestDetailedUsers({
  optional,
  signal,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl('/api/v1/users/detailed/', {
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (optional && (response.status === 401 || response.status === 403)) {
    return { availability: 'unavailable', users: [] };
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch users: ${response.status} ${response.statusText}${
        errorText ? ` - ${errorText}` : ''
      }`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Detailed users response is not an array.');
  }
  return { availability: 'available', users: data };
}

export const isDetailedUsersAbortError = (error) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
