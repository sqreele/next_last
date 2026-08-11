import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-client';
import apiClient from './api-client';
import {
  AIChatError,
  buildAIChatRequest,
  normalizeAIChatError,
  parseAIChatResponse,
  sendAIChatMessage,
  shouldRetryAIChatRequest,
} from './aiChatService';

vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>();
  return {
    ...actual,
    default: { post: vi.fn() },
  };
});

const postMock = vi.mocked(apiClient.post);

beforeEach(() => {
  postMock.mockReset();
});

describe('AI chat API contracts', () => {
  it('serializes the exact request and authorized property context', () => {
    expect(buildAIChatRequest('open jobs', { property_name: 'HOTEL-01' })).toEqual({
      message: 'open jobs',
      property_name: 'HOTEL-01',
    });
    expect(buildAIChatRequest('open jobs')).toEqual({ message: 'open jobs' });
    expect(buildAIChatRequest('open jobs', { property_name: '' })).toEqual({
      message: 'open jobs',
    });
  });

  it('validates a successful response and preserves optional tool calls', () => {
    expect(parseAIChatResponse({ reply: 'Two jobs' })).toEqual({ reply: 'Two jobs' });
    expect(
      parseAIChatResponse({ reply: 'Two jobs', tool_calls: ['list_jobs'] }),
    ).toEqual({ reply: 'Two jobs', tool_calls: ['list_jobs'] });
  });

  it.each([
    undefined,
    null,
    'not-json-object',
    {},
    { reply: null },
    { reply: 'ok', tool_calls: null },
    { reply: 'ok', tool_calls: [1] },
  ])('rejects malformed success payload %#', (payload) => {
    expect(() => parseAIChatResponse(payload)).toThrowError(
      expect.objectContaining({ category: 'invalid_response' }),
    );
  });

  it.each([
    [400, 'bad_request', false],
    [401, 'unauthorized', false],
    [403, 'forbidden', false],
    [429, 'rate_limited', true],
    [500, 'server_error', false],
  ] as const)('normalizes HTTP %i', (status, category, retryable) => {
    const error = normalizeAIChatError(new ApiError('failed', status));
    expect(error).toMatchObject({ category, status, retryable });
  });

  it('applies one conservative local retry only to retryable failures', () => {
    const network = new AIChatError('network_error', 'offline', { retryable: true });
    expect(shouldRetryAIChatRequest(network, 0)).toBe(true);
    expect(shouldRetryAIChatRequest(network, 1)).toBe(false);
    expect(
      shouldRetryAIChatRequest(new AIChatError('forbidden', 'no'), 0),
    ).toBe(false);
    expect(
      shouldRetryAIChatRequest(new AIChatError('cancelled', 'cancelled'), 0),
    ).toBe(false);
  });

  it('posts unknown data, validates it, and passes the abort signal', async () => {
    const controller = new AbortController();
    postMock.mockResolvedValue({ data: { reply: 'Ready' } });

    await expect(
      sendAIChatMessage('status', { property_name: 'HOTEL-01' }, { signal: controller.signal }),
    ).resolves.toEqual({ reply: 'Ready' });

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/ai/chat/',
      { message: 'status', property_name: 'HOTEL-01' },
      { signal: controller.signal },
    );
  });

  it('does not surface an aborted request as a server error', async () => {
    const controller = new AbortController();
    controller.abort();
    postMock.mockRejectedValue(new Error('transport aborted'));

    await expect(
      sendAIChatMessage('status', {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ category: 'cancelled', retryable: false });
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});
