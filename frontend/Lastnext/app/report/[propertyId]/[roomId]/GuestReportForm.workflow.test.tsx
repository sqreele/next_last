import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GuestReportForm } from './GuestReportForm';

const REQUEST_ONE = '11111111-1111-4111-8111-111111111111' as `${string}-${string}-${string}-${string}-${string}`;
const REQUEST_TWO = '22222222-2222-4222-8222-222222222222' as `${string}-${string}-${string}-${string}-${string}`;

function apiResponse(
  body: Record<string, unknown>,
  options: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function successfulResult(jobId = 'j26ABC123'): Response {
  return apiResponse({
    job_id: jobId,
    property: 'Hotel A',
    room: '201',
    message: 'Thanks',
  });
}

function fillReport(description = 'AC is leaking near the window.') {
  fireEvent.change(screen.getByLabelText(/What's the issue/i), {
    target: { value: description },
  });
  fireEvent.change(screen.getByLabelText(/Your name/i), {
    target: { value: 'Alice' },
  });
  fireEvent.change(screen.getByLabelText(/Phone or email/i), {
    target: { value: 'alice@example.com' },
  });
}

function submittedBody(callIndex = 0): Record<string, unknown> {
  const request = vi.mocked(fetch).mock.calls[callIndex]?.[1];
  return JSON.parse(String(request?.body)) as Record<string, unknown>;
}

describe('Guest Report submission idempotency workflow', () => {
  let randomUUIDSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    randomUUIDSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
    randomUUIDSpy.mockReturnValue(REQUEST_ONE);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('sends one immutable request identity, blocks double submit, and waits for authority', async () => {
    let resolveRequest!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    fillReport();

    const submit = screen.getByRole('button', { name: /Send to maintenance/i });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Thank you')).not.toBeInTheDocument();
    expect(submittedBody()).toEqual({
      client_request_id: REQUEST_ONE,
      description: 'AC is leaking near the window.',
      guest_name: 'Alice',
      guest_contact: 'alice@example.com',
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain(
      '/api/v1/public/job-requests/PROPERTY-A/201/',
    );

    await act(async () => resolveRequest(successfulResult()));

    expect(await screen.findByText('Thank you')).toBeInTheDocument();
    expect(screen.getByText('#j26ABC123')).toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('retains the request identity and input after a lost response, then reconciles replay', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(successfulResult('j26REPLAY1'));
    render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    fillReport();

    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(screen.getByLabelText(/What's the issue/i)).toHaveValue(
      'AC is leaking near the window.',
    );

    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    expect(await screen.findByText('#j26REPLAY1')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(submittedBody(0).client_request_id).toBe(REQUEST_ONE);
    expect(submittedBody(1).client_request_id).toBe(REQUEST_ONE);
  });

  it('restores an unresolved submission after remount and retries with the same identity', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(successfulResult('j26REMOUNT'));
    const first = render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    fillReport('Water heater is not working.');
    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    expect(await screen.findByText('Connection lost')).toBeInTheDocument();
    first.unmount();

    render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    expect(await screen.findByDisplayValue('Water heater is not working.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));

    expect(await screen.findByText('#j26REMOUNT')).toBeInTheDocument();
    expect(submittedBody(0).client_request_id).toBe(REQUEST_ONE);
    expect(submittedBody(1).client_request_id).toBe(REQUEST_ONE);
  });

  it('uses a new identity for an intentional second report with identical content', async () => {
    randomUUIDSpy.mockReset();
    randomUUIDSpy.mockReturnValueOnce(REQUEST_ONE).mockReturnValueOnce(REQUEST_TWO);
    vi.mocked(fetch)
      .mockResolvedValueOnce(successfulResult('j26FIRST'))
      .mockResolvedValueOnce(successfulResult('j26SECOND'));
    render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    fillReport();
    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    expect(await screen.findByText('#j26FIRST')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Submit another issue/i }));
    fillReport();
    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    expect(await screen.findByText('#j26SECOND')).toBeInTheDocument();

    expect(submittedBody(0).client_request_id).toBe(REQUEST_ONE);
    expect(submittedBody(1).client_request_id).toBe(REQUEST_TWO);
  });

  it.each([
    ['400', 'Invalid report', apiResponse({ error: 'Invalid report' }, { ok: false, status: 400 })],
    ['429', 'Too many requests', apiResponse({ error: 'Too many requests' }, { ok: false, status: 429 })],
    ['5xx', 'Service unavailable', apiResponse({ error: 'Service unavailable' }, { ok: false, status: 503 })],
  ])('keeps %s failures retryable without false success', async (_label, message, failedResponse) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(successfulResult('j26RECOVER'));
    render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    fillReport('Retryable report');

    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('Thank you')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/What's the issue/i)).toHaveValue('Retryable report');

    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    expect(await screen.findByText('#j26RECOVER')).toBeInTheDocument();
    expect(submittedBody(1).client_request_id).toBe(submittedBody(0).client_request_id);
  });

  it('does not let a late response erase remount recovery before current reconciliation', async () => {
    let resolveRequest!: (value: Response) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveRequest = resolve;
      }))
      .mockResolvedValueOnce(successfulResult('j26CURRENT'));
    const view = render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    fillReport('Late response report');
    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));
    view.unmount();

    render(<GuestReportForm propertyId="PROPERTY-A" roomId="201" />);
    expect(await screen.findByDisplayValue('Late response report')).toBeInTheDocument();
    await act(async () => resolveRequest(successfulResult('j26LATE')));
    expect(screen.queryByText('#j26LATE')).not.toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /Send to maintenance/i }));

    expect(await screen.findByText('#j26CURRENT')).toBeInTheDocument();
    expect(submittedBody(1).client_request_id).toBe(REQUEST_ONE);
    await waitFor(() => expect(window.sessionStorage.length).toBe(0));
  });
});
