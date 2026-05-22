/**
 * Persistent offline-mutation queue for write requests that need to survive
 * a connectivity drop. Backed by localStorage so a tab reload doesn't lose
 * the in-flight work, and exposed via a small subscribe/notify pattern so
 * components can render a badge with the current count without each having
 * to poll storage.
 *
 * The scope is intentionally narrow — only PATCH operations that the
 * UpdateStatusModal uses today flow through here. Adding new shapes is
 * straightforward (extend `QueuedRequest['kind']`), but we don't aim to be
 * a general HTTP replay layer.
 */

const STORAGE_KEY = 'pcms-offline-queue-v1';

export type QueuedKind = 'job-status-update';

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

function load(): QueuedRequest[] {
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

function save(queue: QueuedRequest[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Quota / private-browsing — fall back to memory only by ignoring.
  }
  listeners.forEach((listener) => listener(queue));
}

function genId(): string {
  // Good enough for client-only IDs; not used as a server key.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getQueue(): QueuedRequest[] {
  return load();
}

export function enqueueRequest(input: Omit<QueuedRequest, 'id' | 'createdAt' | 'retries'>): QueuedRequest {
  const queue = load();
  const item: QueuedRequest = {
    ...input,
    id: genId(),
    createdAt: Date.now(),
    retries: 0,
  };
  queue.push(item);
  save(queue);
  return item;
}

export function removeFromQueue(id: string) {
  save(load().filter((item) => item.id !== id));
}

export function clearQueue() {
  save([]);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Fire immediately so subscribers get the current snapshot without polling.
  listener(load());
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
  const initial = load();
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
  const remaining = load().length;
  return { delivered, remaining };
}

function bumpRetry(id: string) {
  const queue = load().map((item) =>
    item.id === id ? { ...item, retries: item.retries + 1 } : item,
  );
  // Cap retries at 5 — beyond that the item gets dropped so it doesn't sit
  // forever on a broken endpoint.
  const filtered = queue.filter((item) => item.retries < 5);
  save(filtered);
}
