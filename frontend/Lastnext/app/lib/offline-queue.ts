/**
 * Persistent offline-mutation queue for write requests that need to survive
 * a connectivity drop. IndexedDB is the durable source of truth for mobile
 * browsers; localStorage mirrors the queue so initial React renders can read
 * a snapshot synchronously.
 *
 * The scope is intentionally narrow: technician work-order mutations that
 * are safe to replay in FIFO order. It is not a general HTTP replay layer.
 */

const STORAGE_KEY = 'pcms-offline-queue-v1';
const DB_NAME = 'pcms-offline';
const DB_VERSION = 1;
const STORE_NAME = 'mutations';

export type QueuedKind = 'job-status-update' | 'job-comment-create';

export interface QueuedRequest {
  id: string;
  kind: QueuedKind;
  /** Free-form label so the UI can show "Status of #JOB-AB12 -> completed". */
  label: string;
  /** API endpoint relative to `NEXT_PUBLIC_API_URL`. */
  endpoint: string;
  method: 'PATCH' | 'POST' | 'PUT';
  body: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

type Listener = (snapshot: QueuedRequest[]) => void;

const listeners = new Set<Listener>();
let memoryQueue: QueuedRequest[] | null = null;
let hydrationStarted = false;
let writeChain: Promise<void> = Promise.resolve();

function loadLocal(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRequest[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function mirrorLocal(queue: QueuedRequest[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Quota / private-browsing — fall back to memory only by ignoring.
  }
}

function notify(queue: QueuedRequest[]) {
  memoryQueue = queue;
  mirrorLocal(queue);
  listeners.forEach((listener) => listener(queue));
}

function supportsIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!supportsIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function readIndexedDb(): Promise<QueuedRequest[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result || []) as QueuedRequest[];
      resolve(rows.sort((a, b) => a.createdAt - b.createdAt));
    };
    request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB transaction failed'));
    };
  });
}

async function writeIndexedDb(queue: QueuedRequest[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const item of queue) {
      store.put(item);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB write failed'));
    };
  });
}

function persist(queue: QueuedRequest[]) {
  notify(queue);
  if (supportsIndexedDb()) {
    writeChain = writeChain
      .catch(() => undefined)
      .then(() => writeIndexedDb(queue))
      .catch(() => undefined);
  }
}

async function hydrateFromIndexedDb() {
  if (hydrationStarted || !supportsIndexedDb()) return;
  hydrationStarted = true;
  try {
    const indexed = await readIndexedDb();
    const local = loadLocal();
    const byId = new Map<string, QueuedRequest>();
    [...local, ...indexed].forEach((item) => byId.set(item.id, item));
    const merged = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
    if (merged.length || local.length) {
      notify(merged);
      writeIndexedDb(merged).catch(() => undefined);
    }
  } catch {
    // localStorage remains the fallback.
  }
}

function genId(): string {
  // Good enough for client-only IDs; not used as a server key.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getQueue(): QueuedRequest[] {
  if (memoryQueue) return memoryQueue;
  memoryQueue = loadLocal();
  hydrateFromIndexedDb();
  return memoryQueue;
}

export function enqueueRequest(input: Omit<QueuedRequest, 'id' | 'createdAt' | 'retries'>): QueuedRequest {
  const queue = getQueue();
  const item: QueuedRequest = {
    ...input,
    id: genId(),
    createdAt: Date.now(),
    retries: 0,
  };
  persist([...queue, item]);
  return item;
}

export function removeFromQueue(id: string) {
  persist(getQueue().filter((item) => item.id !== id));
}

export function clearQueue() {
  persist([]);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Fire immediately so subscribers get the current snapshot without polling.
  listener(getQueue());
  hydrateFromIndexedDb();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replay every queued request in FIFO order. The caller passes an authoriz
 * ed fetch fn (so we don't have to reach into next-auth from here). Each
 * successful replay removes the item; transient failures bump the retry
 * counter and leave the item in place; permanent failures (>=5 retries or
 * 4xx other than 408/425/429) drop the item with the supplied onDrop hook
 * so the UI can show a toast.
 */
export async function replayQueue(
  perform: (item: QueuedRequest) => Promise<Response>,
  onDrop?: (item: QueuedRequest, reason: 'success' | 'gave-up') => void,
): Promise<{ delivered: number; remaining: number }> {
  const initial = getQueue();
  if (!initial.length) return { delivered: 0, remaining: 0 };

  let delivered = 0;
  // Work on a copy because save() will fire listeners between iterations.
  for (const item of initial) {
    try {
      const response = await perform(item);
      if (response.ok || response.status === 204) {
        removeFromQueue(item.id);
        delivered += 1;
        onDrop?.(item, 'success');
        continue;
      }
      const transient =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;
      if (!transient) {
        removeFromQueue(item.id);
        onDrop?.(item, 'gave-up');
        continue;
      }
      bumpRetry(item.id);
    } catch (error) {
      // Network error -> assume still offline; stop replaying so we don't
      // hammer when there's no connection.
      bumpRetry(item.id);
      break;
    }
  }
  const remaining = getQueue().length;
  return { delivered, remaining };
}

function bumpRetry(id: string) {
  const queue = getQueue().map((item) =>
    item.id === id ? { ...item, retries: item.retries + 1 } : item,
  );
  // Cap retries at 5 — beyond that the item gets dropped so it doesn't sit
  // forever on a broken endpoint.
  const filtered = queue.filter((item) => item.retries < 5);
  persist(filtered);
}
