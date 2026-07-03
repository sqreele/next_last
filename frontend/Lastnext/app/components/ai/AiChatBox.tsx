'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { LogIn, Send, Wrench } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { cn } from '@/app/lib/utils/cn';
import { sendAiChatMessage, type AiChatResponse } from '@/app/lib/aiChatService';
import { signIn, useSession } from '@/app/lib/session.client';
import { useProperties, useUser } from '@/app/lib/stores/mainStore';
import type { Property } from '@/app/lib/types';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
};


function getPropertyKey(property: Property): string {
  return String(property.property_id || property.id || '');
}

function getPropertyNames(properties: Property[], selectedPropertyId: string | null): string {
  const scopedProperties = selectedPropertyId
    ? properties.filter((property) => getPropertyKey(property) === String(selectedPropertyId))
    : properties;

  return scopedProperties
    .map((property) => property.name || property.property_id || String(property.id || ''))
    .filter(Boolean)
    .join(', ');
}

function getDisplayUserName(sessionUser: Record<string, unknown> | undefined, username?: string): string {
  const parts = [sessionUser?.first_name, sessionUser?.last_name]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return parts.join(' ') || username || (typeof sessionUser?.username === 'string' ? sessionUser.username : '') || 'user';
}

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
  const { data: session, status } = useSession();
  const { userProfile, selectedPropertyId } = useUser();
  const { properties } = useProperties();
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const userName = useMemo(
    () => getDisplayUserName(session?.user as Record<string, unknown> | undefined, userProfile?.username),
    [session?.user, userProfile?.username],
  );
  const availableProperties = useMemo(
    () => (properties.length > 0 ? properties : userProfile?.properties || []),
    [properties, userProfile?.properties],
  );
  const propertyNames = useMemo(
    () => getPropertyNames(availableProperties, selectedPropertyId),
    [availableProperties, selectedPropertyId],
  );
  const hasProperty = propertyNames.length > 0;
  const greeting = useMemo(
    () => `สวัสดีครับ ${userName} ${propertyNames} มี อยากทราบข้อมูลด้านไหนครับ`,
    [propertyNames, userName],
  );

  useEffect(() => {
    if (!isAuthenticated || !hasProperty) return;

    setHistory((current) => {
      if (current.length > 0) return current;
      return [
        {
          id: createMessageId(),
          role: 'assistant',
          content: greeting,
        },
      ];
    });
  }, [greeting, hasProperty, isAuthenticated]);

  const trimmedMessage = useMemo(() => message.trim(), [message]);
  const canSubmit = trimmedMessage.length > 0 && !isLoading && isAuthenticated && hasProperty;

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

    if (!trimmedMessage || isLoading || !isAuthenticated || !hasProperty) {
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

  if (status === 'loading') {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl items-center justify-center border border-slate-200 bg-white p-5 text-center shadow-sm sm:min-h-[70vh] sm:rounded-lg sm:p-8">
        <div>
          <p className="text-sm font-semibold text-slate-700">กำลังตรวจสอบสถานะการเข้าสู่ระบบ...</p>
          <p className="mt-2 text-xs text-slate-500">กรุณารอสักครู่ก่อนเริ่มแชท</p>
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl items-center justify-center border border-slate-200 bg-white p-5 text-center shadow-sm sm:min-h-[70vh] sm:rounded-lg sm:p-8">
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">AI Chatbot</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">กรุณาเข้าสู่ระบบก่อนเริ่มแชท</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">ระบบจะตรวจสอบผู้ใช้งานและ property ก่อนเปิดใช้งาน AI chat</p>
          <Button type="button" onClick={() => void signIn()} className="mt-5">
            <LogIn className="mr-2 h-4 w-4" />
            เข้าสู่ระบบ
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl flex-col border border-slate-200 bg-white shadow-sm sm:min-h-[70vh] sm:rounded-lg">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">AI Chatbot</p>
        <h1 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">ผู้ช่วยงานซ่อมบำรุง</h1>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:space-y-4 sm:px-5 sm:py-5">
        {!hasProperty ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
            ไม่พบ property สำหรับผู้ใช้นี้ กรุณาติดต่อผู้ดูแลระบบก่อนเริ่มแชท
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            {greeting}
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
                  'max-w-[92%] rounded-lg px-3 py-2.5 text-sm leading-6 sm:max-w-[82%] sm:px-4 sm:py-3',
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
        <div className="mx-3 mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์ข้อความ..."
            rows={2}
            disabled={isLoading || !hasProperty}
            className="min-h-[52px] flex-1 resize-none text-base sm:text-sm"
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
