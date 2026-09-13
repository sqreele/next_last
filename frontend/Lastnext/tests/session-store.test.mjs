import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';

import {
  createServerSession,
  deleteServerSession,
  readServerSession,
  SERVER_SESSION_KEY_PREFIX,
  SERVER_SESSION_MAX_AGE_SECONDS,
  updateServerSession,
} from '../app/lib/auth0/session-store-core.mjs';
import {
  createSessionReference,
  parseSessionReference,
} from '../app/lib/auth0/session-reference.mjs';
import { isUsableServerSession } from '../app/lib/auth0/session-validity.mjs';

const TEST_SECRET = 'test-only-session-secret-with-sufficient-entropy';

function parseCommands(buffer) {
  const commands = [];
  let offset = 0;
  while (offset < buffer.length) {
    assert.equal(buffer[offset], '*');
    const countEnd = buffer.indexOf('\r\n', offset);
    const count = Number(buffer.slice(offset + 1, countEnd));
    offset = countEnd + 2;
    const parts = [];
    for (let index = 0; index < count; index += 1) {
      assert.equal(buffer[offset], '$');
      const lengthEnd = buffer.indexOf('\r\n', offset);
      const length = Number(buffer.slice(offset + 1, lengthEnd));
      offset = lengthEnd + 2;
      parts.push(buffer.slice(offset, offset + length));
      offset += length + 2;
    }
    commands.push(parts);
  }
  return commands;
}

async function createFakeRedis({ password = 'redis-test-password', silent = false } = {}) {
  const values = new Map();
  const observed = [];
  const sockets = new Set();
  const server = net.createServer({ allowHalfOpen: silent }, (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let request = '';
    socket.on('data', (chunk) => { request += chunk.toString('utf8'); });
    socket.on('end', () => {
      if (silent) return;
      const responses = [];
      let authenticated = !password;
      for (const command of parseCommands(request)) {
        const [operation, ...args] = command;
        observed.push(command);
        if (operation === 'AUTH') {
          authenticated = args[0] === password;
          responses.push(authenticated ? '+OK\r\n' : '-WRONGPASS invalid username-password pair\r\n');
        } else if (!authenticated) {
          responses.push('-NOAUTH Authentication required\r\n');
        } else if (operation === 'SELECT') {
          responses.push('+OK\r\n');
        } else if (operation === 'SET') {
          const [key, value] = args;
          const mode = args.at(-1);
          const exists = values.has(key);
          if ((mode === 'NX' && exists) || (mode === 'XX' && !exists)) {
            responses.push('$-1\r\n');
          } else {
            values.set(key, value);
            responses.push('+OK\r\n');
          }
        } else if (operation === 'GET') {
          const value = values.get(args[0]);
          responses.push(value === undefined
            ? '$-1\r\n'
            : `$${Buffer.byteLength(value)}\r\n${value}\r\n`);
        } else if (operation === 'DEL') {
          responses.push(`:${values.delete(args[0]) ? 1 : 0}\r\n`);
        }
      }
      socket.end(responses.join(''));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    values,
    observed,
    url: `redis://:${password}@127.0.0.1:${address.port}/0`,
    close: () => new Promise((resolve, reject) => {
      for (const socket of sockets) socket.destroy();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function session(id, expires = Date.now() + 60_000) {
  return {
    user: {
      id,
      username: id,
      email: `${id}@example.test`,
      profile_image: null,
      positions: 'User',
      properties: [],
      accessToken: `access-${id}`,
      refreshToken: `refresh-${id}`,
      accessTokenExpires: expires,
      created_at: new Date(0).toISOString(),
    },
    expires,
  };
}

function reference() {
  return createSessionReference();
}

test('session references are opaque, strict, and collision-resistant', () => {
  const references = new Set(Array.from({ length: 128 }, createSessionReference));
  assert.equal(references.size, 128);
  for (const value of references) {
    assert.equal(value.length, 46);
    assert.equal(parseSessionReference(value), value);
    assert.ok(!value.includes('access'));
  }
  assert.equal(parseSessionReference('v1.payload'), null);
  assert.equal(parseSessionReference('{"user":{"accessToken":"token"}}'), null);
  assert.equal(parseSessionReference(`v2.${randomBytes(31).toString('base64url')}`), null);
});

test('expired or incomplete server sessions are unusable', () => {
  const now = Date.now();
  assert.equal(isUsableServerSession(session('current', now + 1), now), true);
  assert.equal(isUsableServerSession(session('expired', now - 1), now), false);
  assert.equal(isUsableServerSession({ user: { id: 'missing-token' } }, now), false);
  assert.equal(isUsableServerSession(null, now), false);
});

test('server sessions are encrypted, consistent, isolated, TTL-bound, and deletable', async (t) => {
  const redis = await createFakeRedis();
  t.after(redis.close);
  process.env.REDIS_URL = redis.url;
  process.env.AUTH0_SECRET = TEST_SECRET;
  t.after(() => {
    delete process.env.REDIS_URL;
    delete process.env.AUTH0_SECRET;
  });

  const firstReference = reference();
  const secondReference = reference();
  assert.notEqual(firstReference, secondReference);
  await Promise.all([
    createServerSession(firstReference, session('first'), SERVER_SESSION_MAX_AGE_SECONDS + 100),
    createServerSession(secondReference, session('second'), 120),
  ]);

  assert.equal((await readServerSession(firstReference))?.user?.id, 'first');
  assert.equal((await readServerSession(firstReference))?.user?.id, 'first');
  assert.equal((await readServerSession(secondReference))?.user?.id, 'second');
  assert.equal(await readServerSession(reference()), null);

  const firstKey = `${SERVER_SESSION_KEY_PREFIX}${firstReference}`;
  const encryptedValue = redis.values.get(firstKey);
  assert.ok(encryptedValue?.startsWith('v1.'));
  assert.ok(!encryptedValue.includes('access-first'));
  assert.ok(!encryptedValue.includes('refresh-first'));
  const firstSet = redis.observed.find((command) => command[0] === 'SET' && command[1] === firstKey);
  assert.deepEqual(firstSet?.slice(3), ['EX', String(SERVER_SESSION_MAX_AGE_SECONDS), 'NX']);
  assert.ok(redis.observed.some((command) => command[0] === 'SELECT' && command[1] === '0'));

  await updateServerSession(firstReference, session('updated'), 90);
  assert.equal((await readServerSession(firstReference))?.user?.id, 'updated');
  await deleteServerSession(firstReference);
  assert.equal(await readServerSession(firstReference), null);
});

test('missing REDIS_URL fails closed', async (t) => {
  const previous = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  });
  await assert.rejects(() => readServerSession(reference()), /REDIS_URL is required/);
});

test('Redis authentication failure is rejected without exposing credentials', async (t) => {
  const redis = await createFakeRedis({ password: 'expected-test-password' });
  t.after(redis.close);
  process.env.REDIS_URL = redis.url.replace('expected-test-password', 'incorrect-test-password');
  process.env.AUTH0_SECRET = TEST_SECRET;
  t.after(() => {
    delete process.env.REDIS_URL;
    delete process.env.AUTH0_SECRET;
  });
  await assert.rejects(
    () => readServerSession(reference()),
    (error) => error instanceof Error && !error.message.includes('incorrect-test-password'),
  );
});

test('unreachable Redis fails closed', async (t) => {
  const previous = process.env.REDIS_URL;
  process.env.REDIS_URL = 'redis://127.0.0.1:1/0';
  t.after(() => {
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  });
  await assert.rejects(() => readServerSession(reference()));
});

test('malformed or undecryptable stored payload is unauthenticated', async (t) => {
  const redis = await createFakeRedis();
  t.after(redis.close);
  process.env.REDIS_URL = redis.url;
  process.env.AUTH0_SECRET = TEST_SECRET;
  t.after(() => {
    delete process.env.REDIS_URL;
    delete process.env.AUTH0_SECRET;
  });
  const malformedReference = reference();
  redis.values.set(`${SERVER_SESSION_KEY_PREFIX}${malformedReference}`, 'not-a-session');
  assert.equal(await readServerSession(malformedReference), null);

  const encryptedReference = reference();
  await createServerSession(encryptedReference, session('encrypted'));
  process.env.AUTH0_SECRET = 'different-test-secret';
  assert.equal(await readServerSession(encryptedReference), null);
});

test('Redis command timeout fails closed', async (t) => {
  const redis = await createFakeRedis({ silent: true });
  t.after(redis.close);
  process.env.REDIS_URL = redis.url;
  t.after(() => { delete process.env.REDIS_URL; });
  await assert.rejects(() => readServerSession(reference()), /timed out/);
});
