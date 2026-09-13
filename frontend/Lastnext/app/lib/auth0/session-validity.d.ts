import type { CompatSession } from './session-compat';

export function isUsableServerSession(
  session: CompatSession | null,
  now?: number,
): boolean;
