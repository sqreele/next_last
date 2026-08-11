import { ApiError } from './api-client';
import apiClient from './api-client';
import { API_CONFIG } from './config';

export type AIChatRequest = {
  message: string;
  property_name?: string;
};

export type AIChatResponse = {
  reply: string;
  tool_calls?: string[];
};

export type AIChatErrorCategory =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'timeout'
  | 'cancelled'
  | 'invalid_response';

export class AIChatError extends Error {
  readonly category: AIChatErrorCategory;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    category: AIChatErrorCategory,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'AIChatError';
    this.category = category;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    Object.setPrototypeOf(this, AIChatError.prototype);
  }
}

export type AIChatContext = {
  property_name?: string;
};

export type SendAIChatOptions = {
  signal?: AbortSignal;
};

const AI_MAX_RETRIES = 1;
const AI_RETRY_DELAY_MS = 250;

export function buildAIChatRequest(
  message: string,
  context: AIChatContext = {},
): AIChatRequest {
  const request: AIChatRequest = { message };
  if (context.property_name) {
    request.property_name = context.property_name;
  }
  return request;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAIChatResponse(value: unknown): AIChatResponse {
  if (!isRecord(value) || typeof value.reply !== 'string') {
    throw new AIChatError(
      'invalid_response',
      'ได้รับคำตอบจากระบบในรูปแบบที่ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
    );
  }

  if (
    value.tool_calls !== undefined &&
    (!Array.isArray(value.tool_calls) ||
      !value.tool_calls.every((toolCall) => typeof toolCall === 'string'))
  ) {
    throw new AIChatError(
      'invalid_response',
      'ได้รับคำตอบจากระบบในรูปแบบที่ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
    );
  }

  return value.tool_calls === undefined
    ? { reply: value.reply }
    : { reply: value.reply, tool_calls: value.tool_calls };
}

function categoryForStatus(status: number | undefined): AIChatErrorCategory {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status !== undefined && status >= 400 && status < 500) return 'bad_request';
  if (status !== undefined && status >= 500) return 'server_error';
  return 'network_error';
}

export function normalizeAIChatError(
  error: unknown,
  signal?: AbortSignal,
): AIChatError {
  if (error instanceof AIChatError) return error;

  if (signal?.aborted) {
    return new AIChatError('cancelled', 'AI chat request cancelled');
  }

  if (error instanceof ApiError) {
    const errorCode = error.details?.code;
    if (errorCode === 'ERR_CANCELED' || errorCode === 'ABORT_ERR') {
      return new AIChatError('cancelled', 'AI chat request cancelled');
    }
    if (error.status === 408) {
      return new AIChatError('timeout', error.message, {
        status: error.status,
      });
    }

    const category = categoryForStatus(error.status);
    return new AIChatError(category, error.message, {
      status: error.status,
      retryable: category === 'network_error' || category === 'rate_limited',
    });
  }

  return new AIChatError(
    'network_error',
    error instanceof Error
      ? error.message
      : 'ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง',
    { retryable: true },
  );
}

export function shouldRetryAIChatRequest(
  error: AIChatError,
  attempt: number,
): boolean {
  return error.retryable && attempt < AI_MAX_RETRIES;
}

function waitForRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AIChatError('cancelled', 'AI chat request cancelled'));
      return;
    }

    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(new AIChatError('cancelled', 'AI chat request cancelled'));
    };
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, AI_RETRY_DELAY_MS);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function sendAIChatMessage(
  message: string,
  context: AIChatContext = {},
  options: SendAIChatOptions = {},
): Promise<AIChatResponse> {
  const request = buildAIChatRequest(message, context);
  let attempt = 0;

  while (true) {
    try {
      const response = await apiClient.post<unknown>(
        API_CONFIG.endpoints.aiChat,
        request,
        { signal: options.signal },
      );
      return parseAIChatResponse(response.data);
    } catch (error: unknown) {
      const normalizedError = normalizeAIChatError(error, options.signal);
      if (!shouldRetryAIChatRequest(normalizedError, attempt)) {
        throw normalizedError;
      }
      attempt += 1;
      await waitForRetry(options.signal);
    }
  }
}

// Preserve the established import name while the canonical API type uses AI.
export const sendAiChatMessage = sendAIChatMessage;
export type AiChatResponse = AIChatResponse;
