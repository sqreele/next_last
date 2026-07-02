'use client';

import { FormEvent, KeyboardEvent, useMemo, useState } from 'react';
import { Send, Wrench } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { cn } from '@/app/lib/utils/cn';
import { sendAiChatMessage, type AiChatResponse } from '@/app/lib/aiChatService';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
};

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง';
}

export default function AiChatBox() {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedMessage = useMemo(() => message.trim(), [message]);
  const canSubmit = trimmedMessage.length > 0 && !isLoading;

  const appendAssistantReply = (response: AiChatResponse) => {
    setHistory((current) => [
      ...current,
      {
        id: createMessageId(),
        role: 'assistant',
        content: response.reply,
        toolCalls: response.tool_calls,
      },
    ]);
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!trimmedMessage || isLoading) {
      return;
    }

    const userMessage = trimmedMessage;
    setMessage('');
    setError(null);
    setHistory((current) => [
      ...current,
      {
        id: createMessageId(),
        role: 'user',
        content: userMessage,
      },
    ]);

    try {
      setIsLoading(true);
      const response = await sendAiChatMessage(userMessage);
      appendAssistantReply(response);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">AI Chatbot</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">ผู้ช่วยงานซ่อมบำรุง</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {history.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            ลองถามว่า “สรุปงานซ่อมทั้งหมดให้หน่อย”
          </div>
        ) : (
          history.map((chatMessage) => (
            <article
              key={chatMessage.id}
              className={cn(
                'flex',
                chatMessage.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6',
                  chatMessage.role === 'user'
                    ? 'bg-cyan-700 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-900',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{chatMessage.content}</p>
                {chatMessage.role === 'assistant' && chatMessage.toolCalls?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                    {chatMessage.toolCalls.map((toolCall) => (
                      <span key={toolCall} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1">
                        <Wrench className="h-3 w-3" />
                        {toolCall}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}

        {isLoading ? (
          <div className="flex justify-start">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              กำลังรอคำตอบ...
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mx-5 mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์ข้อความ..."
            rows={2}
            disabled={isLoading}
            className="min-h-[52px] flex-1 resize-none"
          />
          <Button type="submit" disabled={!canSubmit} isLoading={isLoading} loadingText="กำลังส่ง">
            <Send className="mr-2 h-4 w-4" />
            ส่ง
          </Button>
        </div>
      </form>
    </section>
  );
}
