import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Socket } from 'node:net';

export const SERVER_SESSION_MAX_AGE_SECONDS = 60 * 24 * 60 * 60;
export const SERVER_SESSION_KEY_PREFIX = 'auth:session:';
export const REDIS_SESSION_TIMEOUT_MS = 1500;

function getSessionSecret() {
  const secret =
    process.env.AUTH0_SESSION_SECRET ||
    process.env.AUTH0_SECRET ||
    process.env.SESSION_SECRET;
  if (secret) return secret;
  throw new Error('AUTH0_SESSION_SECRET or AUTH0_SECRET is required for server sessions.');
}

function getRedisUrl() {
  const raw = process.env.REDIS_URL;
  if (!raw) throw new Error('REDIS_URL is required for server sessions.');
  const url = new URL(raw);
  if (url.protocol !== 'redis:') {
    throw new Error('REDIS_URL must use redis:// for server sessions.');
  }
  return url;
}

function encodeCommand(parts) {
  return Buffer.from(
    `*${parts.length}\r\n${parts
      .map((part) => `$${Buffer.byteLength(String(part))}\r\n${String(part)}\r\n`)
      .join('')}`,
  );
}

function parseReplies(raw) {
  const replies = [];
  let offset = 0;
  while (offset < raw.length) {
    const marker = raw[offset];
    const lineEnd = raw.indexOf('\r\n', offset);
    if (lineEnd < 0) throw new Error('Invalid Redis session response.');
    if (marker === '-') throw new Error('Redis session operation failed.');
    if (marker === '+' || marker === ':') {
      const value = raw.slice(offset + 1, lineEnd);
      replies.push(marker === '+' ? value : Number(value));
      offset = lineEnd + 2;
      continue;
    }
    if (marker === '$') {
      const length = Number(raw.slice(offset + 1, lineEnd));
      offset = lineEnd + 2;
      if (length < 0) {
        replies.push(null);
      } else {
        replies.push(raw.slice(offset, offset + length));
        offset += length + 2;
      }
      continue;
    }
    throw new Error('Invalid Redis session response.');
  }
  return replies;
}

export function redisSessionCommand(command) {
  const url = getRedisUrl();
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let rawResponse = '';
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(REDIS_SESSION_TIMEOUT_MS, () => {
      fail(new Error('Redis session operation timed out.'));
    });
    socket.once('error', fail);
    socket.on('data', (chunk) => {
      rawResponse += chunk.toString('utf8');
    });
    socket.once('end', () => {
      if (settled) return;
      try {
        const replies = parseReplies(rawResponse);
        settled = true;
        resolve(replies.at(-1) ?? null);
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Invalid Redis session response.'));
      }
    });
    socket.connect(Number(url.port || 6379), url.hostname, () => {
      const commands = url.password
        ? [
            ['AUTH', decodeURIComponent(url.password)],
            ['SELECT', url.pathname.slice(1) || '0'],
            command,
          ]
        : [['SELECT', url.pathname.slice(1) || '0'], command];
      socket.end(Buffer.concat(commands.map(encodeCommand)));
    });
  });
}

function sealSession(session) {
  const key = createHash('sha256').update(getSessionSecret()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function openSession(value) {
  try {
    const [version, iv, tag, encrypted] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted) return null;
    const key = createHash('sha256').update(getSessionSecret()).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8'),
    );
  } catch {
    return null;
  }
}

function sessionKey(reference) {
  return `${SERVER_SESSION_KEY_PREFIX}${reference}`;
}

export async function createServerSession(
  reference,
  session,
  maxAge = SERVER_SESSION_MAX_AGE_SECONDS,
) {
  const result = await redisSessionCommand([
    'SET',
    sessionKey(reference),
    sealSession(session),
    'EX',
    String(Math.min(maxAge, SERVER_SESSION_MAX_AGE_SECONDS)),
    'NX',
  ]);
  if (result !== 'OK') throw new Error('Could not create server session.');
}

export async function readServerSession(reference) {
  const value = await redisSessionCommand(['GET', sessionKey(reference)]);
  return typeof value === 'string' ? openSession(value) : null;
}

export async function updateServerSession(
  reference,
  session,
  maxAge = SERVER_SESSION_MAX_AGE_SECONDS,
) {
  const result = await redisSessionCommand([
    'SET',
    sessionKey(reference),
    sealSession(session),
    'EX',
    String(Math.min(maxAge, SERVER_SESSION_MAX_AGE_SECONDS)),
    'XX',
  ]);
  if (result !== 'OK') throw new Error('Server session no longer exists.');
}

export async function deleteServerSession(reference) {
  await redisSessionCommand(['DEL', sessionKey(reference)]);
}
