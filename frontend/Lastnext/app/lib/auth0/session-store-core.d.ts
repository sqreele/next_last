import type { CompatSession } from './session-compat';

export const SERVER_SESSION_MAX_AGE_SECONDS: number;
export const SERVER_SESSION_KEY_PREFIX: string;
export const REDIS_SESSION_TIMEOUT_MS: number;

export function redisSessionCommand(command: string[]): Promise<string | number | null>;
export function createServerSession(
  reference: string,
  session: CompatSession,
  maxAge?: number,
): Promise<void>;
export function readServerSession(reference: string): Promise<CompatSession | null>;
export function updateServerSession(
  reference: string,
  session: CompatSession,
  maxAge?: number,
): Promise<void>;
export function deleteServerSession(reference: string): Promise<void>;
