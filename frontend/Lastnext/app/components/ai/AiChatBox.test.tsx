import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiChatBox from './AiChatBox';
import { sendAiChatMessage } from '@/app/lib/aiChatService';

vi.mock('@/app/lib/aiChatService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/lib/aiChatService')>();
  return { ...actual, sendAiChatMessage: vi.fn() };
});

vi.mock('@/app/lib/session.client', () => ({
  signIn: vi.fn(),
  useSession: () => ({
    status: 'authenticated',
    data: { user: { first_name: 'Test', accessToken: 'token' } },
  }),
}));

vi.mock('@/app/lib/stores/mainStore', () => ({
  useUser: () => ({
    selectedPropertyId: 'HOTEL-01',
    userProfile: { username: 'tester', properties: [] },
  }),
  useProperties: () => ({
    properties: [{ id: 1, property_id: 'HOTEL-01', name: 'Hotel One' }],
  }),
}));

const sendMock = vi.mocked(sendAiChatMessage);

beforeEach(() => {
  sendMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AiChatBox request lifecycle', () => {
  it('aborts the active request on unmount and cannot apply its late response', async () => {
    let resolveRequest: ((value: { reply: string }) => void) | undefined;
    sendMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const view = render(<AiChatBox />);
    const input = screen.getByPlaceholderText('พิมพ์ข้อความ...');
    fireEvent.change(input, { target: { value: 'สถานะงาน' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    const options = sendMock.mock.calls[0][2];
    expect(options?.signal?.aborted).toBe(false);

    view.unmount();
    expect(options?.signal?.aborted).toBe(true);

    resolveRequest?.({ reply: 'late response' });
    await Promise.resolve();
  });
});
