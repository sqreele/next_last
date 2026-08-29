export const INVITATION_TOKEN_STORAGE_KEY = 'staymaint:tenant-invitation-token';

function readSessionToken(storage) {
  try {
    return (storage.getItem(INVITATION_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function captureInvitationToken(location, history, storage) {
  const fragment = typeof location.hash === 'string' ? location.hash.replace(/^#/, '') : '';
  const fragmentToken = (new URLSearchParams(fragment).get('token') || '').trim();

  if (fragmentToken) {
    try {
      storage.setItem(INVITATION_TOKEN_STORAGE_KEY, fragmentToken);
    } catch {
      // The caller can still use the captured token for the current page load.
    }
  }

  // This route has no legitimate query parameters. Removing both search and
  // fragment also ensures obsolete query-token links cannot remain visible.
  if (location.hash || location.search) {
    history.replaceState(history.state, '', location.pathname);
  }

  return fragmentToken || readSessionToken(storage);
}

export function clearInvitationToken(storage) {
  try {
    storage.removeItem(INVITATION_TOKEN_STORAGE_KEY);
  } catch {
    // Storage may be unavailable under restrictive browser privacy settings.
  }
}
