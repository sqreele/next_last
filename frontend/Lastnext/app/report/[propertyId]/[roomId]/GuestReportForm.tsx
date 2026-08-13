'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle, Wrench } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Label } from '@/app/components/ui/label';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '');

interface GuestReportFormProps {
  propertyId: string;
  roomId: string;
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

type GuestReportPayload = {
  description: string;
  guest_name: string;
  guest_contact: string;
};

type PendingGuestReport = {
  requestId: string;
  payload: GuestReportPayload;
};

function pendingStorageKey(propertyId: string, roomId: string): string {
  return `guest-report:pending:${encodeURIComponent(propertyId)}:${encodeURIComponent(roomId)}`;
}

function createRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function samePayload(left: GuestReportPayload, right: GuestReportPayload): boolean {
  return (
    left.description === right.description &&
    left.guest_name === right.guest_name &&
    left.guest_contact === right.guest_contact
  );
}

function readPendingSubmission(storageKey: string): PendingGuestReport | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<PendingGuestReport>;
    if (
      typeof candidate.requestId !== 'string' ||
      !candidate.payload ||
      typeof candidate.payload.description !== 'string' ||
      typeof candidate.payload.guest_name !== 'string' ||
      typeof candidate.payload.guest_contact !== 'string'
    ) {
      return null;
    }
    return candidate as PendingGuestReport;
  } catch {
    return null;
  }
}

function persistPendingSubmission(storageKey: string, pending: PendingGuestReport): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    // The backend identity still protects this mounted request if storage is unavailable.
  }
}

function clearPendingSubmission(storageKey: string, requestId: string): void {
  try {
    const current = readPendingSubmission(storageKey);
    if (!current || current.requestId === requestId) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Storage availability must not turn an authoritative success into an error.
  }
}

export function GuestReportForm({ propertyId, roomId }: GuestReportFormProps) {
  const [description, setDescription] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    job_id: string;
    property: string;
    room: string;
  } | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const pendingRef = useRef<PendingGuestReport | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeStorageKeyRef = useRef<string | null>(null);
  const storageKey = pendingStorageKey(propertyId, roomId);

  useEffect(() => {
    mountedRef.current = true;
    activeRequestIdRef.current = null;
    activeStorageKeyRef.current = null;
    inFlightRef.current = false;
    const pending = readPendingSubmission(storageKey);
    pendingRef.current = pending;
    if (pending) {
      setDescription(pending.payload.description);
      setGuestName(pending.payload.guest_name);
      setGuestContact(pending.payload.guest_contact);
    } else {
      setDescription('');
      setGuestName('');
      setGuestContact('');
    }
    setConfirmation(null);
    setError(null);
    setState('idle');
    return () => {
      mountedRef.current = false;
    };
  }, [storageKey]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlightRef.current) return;
    if (!description.trim()) {
      setError('Please describe the issue.');
      return;
    }

    const payload: GuestReportPayload = {
      description: description.trim(),
      guest_name: guestName.trim(),
      guest_contact: guestContact.trim(),
    };
    const previous = pendingRef.current;
    const requestId = previous && samePayload(previous.payload, payload)
      ? previous.requestId
      : createRequestId();
    const pending = { requestId, payload };
    pendingRef.current = pending;
    activeRequestIdRef.current = requestId;
    activeStorageKeyRef.current = storageKey;
    persistPendingSubmission(storageKey, pending);
    inFlightRef.current = true;
    setState('submitting');
    setError(null);
    try {
      const url = `${API_BASE_URL}/api/v1/public/job-requests/${encodeURIComponent(
        propertyId,
      )}/${encodeURIComponent(roomId)}/`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_request_id: requestId,
          description: payload.description,
          guest_name: payload.guest_name || undefined,
          guest_contact: payload.guest_contact || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      if (
        !mountedRef.current ||
        activeRequestIdRef.current !== requestId ||
        activeStorageKeyRef.current !== storageKey
      ) return;
      clearPendingSubmission(storageKey, requestId);
      pendingRef.current = null;
      setConfirmation({
        job_id: data.job_id,
        property: data.property,
        room: data.room,
      });
      setState('success');
    } catch (err: any) {
      if (
        !mountedRef.current ||
        activeRequestIdRef.current !== requestId ||
        activeStorageKeyRef.current !== storageKey
      ) return;
      setError(err?.message || 'Could not submit your request. Please try again.');
      setState('error');
    } finally {
      if (
        activeRequestIdRef.current === requestId &&
        activeStorageKeyRef.current === storageKey
      ) {
        inFlightRef.current = false;
      }
    }
  };

  if (state === 'success' && confirmation) {
    return (
      <div className="w-full max-w-none rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl sm:mx-auto sm:max-w-md sm:rounded-3xl sm:p-6">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
          Thank you
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-700">
          Our maintenance team at <span className="font-bold">{confirmation.property}</span> has
          been notified about <span className="font-bold">Room {confirmation.room}</span>.
        </p>
        <dl className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-slate-500">Ticket</dt>
            <dd className="font-mono font-bold text-slate-900">#{confirmation.job_id}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs font-medium text-slate-500">
          A staff member may follow up via the contact details you provided. You can close this
          page.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDescription('');
            setGuestName('');
            setGuestContact('');
            setConfirmation(null);
            pendingRef.current = null;
            activeRequestIdRef.current = null;
            activeStorageKeyRef.current = null;
            setState('idle');
          }}
          className="mt-5 w-full"
        >
          Submit another issue
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none rounded-2xl border border-cyan-100 bg-white p-4 shadow-xl sm:mx-auto sm:max-w-md sm:rounded-3xl sm:p-6">
      <header className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow">
          <Wrench className="h-6 w-6" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Maintenance request
          </p>
          <h1 className="text-xl font-black tracking-tight text-slate-900">
            Room {roomId}
          </h1>
        </div>
      </header>
      <p className="mt-3 text-sm font-medium text-slate-600">
        Tell our team what needs attention. We'll triage it as soon as we can.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-sm font-bold text-slate-900">
            What's the issue? <span className="text-rose-600">*</span>
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
            placeholder="e.g. the air conditioner is leaking water near the window."
            className="min-h-[120px] border-2 border-slate-300 text-base"
            required
          />
          <p className="text-right text-[11px] font-medium text-slate-500">
            {description.length}/1000
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="guestName" className="text-sm font-bold text-slate-900">
            Your name <span className="text-xs font-medium text-slate-500">(optional)</span>
          </Label>
          <Input
            id="guestName"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value.slice(0, 120))}
            placeholder="So we can address you properly"
            className="h-12 border-2 border-slate-300 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="guestContact" className="text-sm font-bold text-slate-900">
            Phone or email{' '}
            <span className="text-xs font-medium text-slate-500">(optional)</span>
          </Label>
          <Input
            id="guestContact"
            value={guestContact}
            onChange={(event) => setGuestContact(event.target.value.slice(0, 120))}
            placeholder="So we can confirm when it's resolved"
            className="h-12 border-2 border-slate-300 text-base"
            inputMode="email"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={state === 'submitting'}
          className="h-12 w-full bg-blue-600 text-base font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-700"
        >
          {state === 'submitting' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            'Send to maintenance'
          )}
        </Button>
      </form>

      <p className="mt-5 text-[11px] font-medium text-slate-500">
        This page is provided by the hotel's maintenance management system. Your message goes
        straight to the on-duty team.
      </p>
    </div>
  );
}
