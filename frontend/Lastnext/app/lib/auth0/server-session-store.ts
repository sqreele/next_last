import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Socket } from 'net';
import type { CompatSession } from './session-compat';

const PREFIX = 'auth:session:';
const ABSOLUTE_SESSION_SECONDS = 60 * 24 * 60 * 60;

type RedisReply = string | number | null;

function secret(): string {
  const value = process.env.AUTH0_SESSION_SECRET || process.env.AUTH0_SECRET || process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV !== 'production') return 'dev-only-auth-session-secret-change-me';
  throw new Error('AUTH0_SESSION_SECRET or AUTH0_SECRET is required for server sessions.');
}

function redisUrl(): URL {
  const value = process.env.REDIS_URL;
  if (!value) throw new Error('REDIS_URL is required for server sessions.');
  return new URL(value);
}

function encodeCommand(parts: string[]): Buffer {
  return Buffer.from(`*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`);
}

function redisCommand(parts: string[]): Promise<RedisReply> {
  const url = redisUrl();
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let response = '';
    const fail = (error: Error) => { socket.destroy(); reject(error); };
    socket.setTimeout(1500, () => fail(new Error('Redis session operation timed out.')));
    socket.once('error', fail);
    socket.on('data', (chunk: Buffer) => { response += chunk.toString('utf8'); });
    socket.once('end', () => {
      try {
        const replies: RedisReply[] = [];
        let offset = 0;
        while (offset < response.length) {
          const type = response[offset];
          const lineEnd = response.indexOf('\r\n', offset);
          if (lineEnd < 0) throw new Error('Invalid Redis session response.');
          if (type === '-') throw new Error('Redis session operation failed.');
          if (type === '+' || type === ':') {
            replies.push(type === '+' ? response.slice(offset + 1, lineEnd) : Number(response.slice(offset + 1, lineEnd)));
            offset = lineEnd + 2;
          } else if (type === '$') {
            const length = Number(response.slice(offset + 1, lineEnd));
            offset = lineEnd + 2;
            if (length < 0) replies.push(null);
            else { replies.push(response.slice(offset, offset + length)); offset += length + 2; }
          } else throw new Error('Invalid Redis session response.');
        }
        resolve(replies.at(-1) ?? null);
      } catch (error) { reject(error instanceof Error ? error : new Error('Invalid Redis session response.')); }
    });
    socket.connect(Number(url.port || 6379), url.hostname, () => {
      const commands = url.password ? [['AUTH', decodeURIComponent(url.password)], ['SELECT', url.pathname.slice(1) || '0'], parts] : [['SELECT', url.pathname.slice(1) || '0'], parts];
      socket.end(Buffer.concat(commands.map(encodeCommand)));
    });
  });
}

function seal(session: CompatSession): string {
  const key = createHash('sha256').update(secret()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function open(value: string): CompatSession | null {
  try {
    const [version, iv, tag, encrypted] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted) return null;
    const key = createHash('sha256').update(secret()).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')) as CompatSession;
  } catch { return null; }
}

function key(reference: string): string { return `${PREFIX}${reference}`; }

export async function createServerSession(reference: string, session: CompatSession, ttl = ABSOLUTE_SESSION_SECONDS): Promise<void> {
  const result = await redisCommand(['SET', key(reference), seal(session), 'EX', String(Math.min(ttl, ABSOLUTE_SESSION_SECONDS)), 'NX']);
  if (result !== 'OK') throw new Error('Could not create server session.');
}

export async function loadServerSession(reference: string): Promise<CompatSession | null> {
  const value = await redisCommand(['GET', key(reference)]);
  return typeof value === 'string' ? open(value) : null;
}

export async function updateServerSession(reference: string, session: CompatSession, ttl = ABSOLUTE_SESSION_SECONDS): Promise<void> {
  const result = await redisCommand(['SET', key(reference), seal(session), 'EX', String(Math.min(ttl, ABSOLUTE_SESSION_SECONDS)), 'XX']);
  if (result !== 'OK') throw new Error('Server session no longer exists.');
}

export async function deleteServerSession(reference: string): Promise<void> {
  await redisCommand(['DEL', key(reference)]);
}

export { ABSOLUTE_SESSION_SECONDS };
