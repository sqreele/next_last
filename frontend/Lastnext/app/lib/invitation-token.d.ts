export const INVITATION_TOKEN_STORAGE_KEY: string;

export function captureInvitationToken(
  location: Pick<Location, 'hash' | 'search' | 'pathname'>,
  history: Pick<History, 'state' | 'replaceState'>,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): string;

export function clearInvitationToken(
  storage: Pick<Storage, 'removeItem'>,
): void;
