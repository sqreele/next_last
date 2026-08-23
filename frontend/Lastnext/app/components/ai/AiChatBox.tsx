"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarDays,
  ClipboardList,
  LogIn,
  RotateCcw,
  Send,
  Wrench,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import HeaderPropertyList from "@/app/components/jobs/HeaderPropertyList";
import { cn } from "@/app/lib/utils/cn";
import {
  isAiChatRequestCanceled,
  sendAiChatMessage,
  type AiChatResponse,
} from "@/app/lib/aiChatService";
import {
  canStartAiChatRequest,
  isCurrentAiChatRequest,
} from "@/app/lib/ai-chat-request.mjs";
import { signIn, useSession } from "@/app/lib/session.client";
import { useProperties, useUser } from "@/app/lib/stores/mainStore";
import type { Property } from "@/app/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
};

const QUICK_ACTIONS = [
  {
    label: "งานแจ้งซ่อมวันนี้",
    message: "งานแจ้งซ่อมวันนี้มีอะไรบ้าง",
    icon: CalendarDays,
  },
  {
    label: "งานประจำเดือนนี้",
    message: "งานประจำเดือนนี้มีอะไรบ้าง ขอรายละเอียดงาน",
    icon: ClipboardList,
  },
  {
    label: "รายละเอียดงานประจำเดือน",
    message:
      "ขอรายละเอียดงานประจำเดือนนี้ แยกตามวันที่ ห้อง/พื้นที่ ผู้รับผิดชอบ และสถานะ",
    icon: CalendarDays,
  },
];

function getPropertyKey(property: Property): string {
  return String(property.property_id || "");
}

function getDisplayUserName(
  sessionUser: Record<string, unknown> | undefined,
  username?: string,
): string {
  const parts = [sessionUser?.first_name, sessionUser?.last_name]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return (
    parts.join(" ") ||
    username ||
    (typeof sessionUser?.username === "string" ? sessionUser.username : "") ||
    "user"
  );
}

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง";
}

export default function AiChatBox() {
  const { data: session, status } = useSession();
  const { userProfile, selectedPropertyId } = useUser();
  const { properties } = useProperties();
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);
  const selectedPropertyRef = useRef(selectedPropertyId);
  selectedPropertyRef.current = selectedPropertyId;

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const sessionUser = session?.user as Record<string, unknown> | undefined;
  const sessionUserIdentity = String(
    sessionUser?.sub ||
      sessionUser?.id ||
      sessionUser?.email ||
      sessionUser?.username ||
      "",
  );
  const userName = useMemo(
    () =>
      getDisplayUserName(
        sessionUser,
        userProfile?.username,
      ),
    [sessionUser, userProfile?.username],
  );
  const availableProperties = useMemo(
    () => (properties.length > 0 ? properties : userProfile?.properties || []),
    [properties, userProfile?.properties],
  );
  const activeProperty = useMemo(
    () =>
      selectedPropertyId
        ? availableProperties.find(
            (property) => getPropertyKey(property) === selectedPropertyId,
          )
        : undefined,
    [availableProperties, selectedPropertyId],
  );
  const activePropertyName = activeProperty?.property_id || "";
  const activePropertyLabel = activeProperty?.name || activePropertyName;
  const hasProperty = Boolean(activePropertyName);
  const greeting = useMemo(
    () =>
      `สวัสดีครับ ${userName} ต้องการทราบข้อมูลงานซ่อมบำรุงของ ${activePropertyLabel} ด้านไหนครับ`,
    [activePropertyLabel, userName],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    loadingRef.current = false;
    setIsLoading(false);
    setHistory([]);
    setError(null);
  }, [selectedPropertyId, sessionUserIdentity]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [history, isLoading]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    },
    [],
  );

  const trimmedMessage = useMemo(() => message.trim(), [message]);
  const canSubmit = canStartAiChatRequest({
    message: trimmedMessage,
    requestInFlight: isLoading,
    isAuthenticated,
    propertyId: activePropertyName,
  });

  const appendAssistantReply = useCallback((response: AiChatResponse) => {
    setHistory((current) => [
      ...current,
      {
        id: createMessageId(),
        role: "assistant",
        content: response.reply,
        toolCalls: response.tool_calls,
      },
    ]);
  }, []);

  const startNewChat = useCallback(() => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    loadingRef.current = false;
    setIsLoading(false);
    setMessage("");
    setHistory([]);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const submitChatMessage = async (rawMessage: string) => {
    const nextMessage = rawMessage.trim();
    if (!canStartAiChatRequest({
      message: nextMessage,
      requestInFlight: loadingRef.current,
      isAuthenticated,
      propertyId: activePropertyName,
    })) {
      return;
    }

    const userMessage = nextMessage;
    const requestPropertyId = activePropertyName;
    const requestId = ++requestIdRef.current;
    const abortController = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = abortController;
    loadingRef.current = true;
    setIsLoading(true);
    setMessage("");
    setError(null);
    setHistory((current) => [
      ...current,
      {
        id: createMessageId(),
        role: "user",
        content: userMessage,
      },
    ]);

    try {
      const response = await sendAiChatMessage(userMessage, {
        property_name: requestPropertyId,
      }, abortController.signal);
      if (!isCurrentAiChatRequest({
        requestId,
        currentRequestId: requestIdRef.current,
        requestPropertyId,
        currentPropertyId: selectedPropertyRef.current,
      })) {
        return;
      }
      appendAssistantReply(response);
    } catch (submitError) {
      if (
        isAiChatRequestCanceled(submitError) ||
        !isCurrentAiChatRequest({
          requestId,
          currentRequestId: requestIdRef.current,
          requestPropertyId,
          currentPropertyId: selectedPropertyRef.current,
        })
      ) {
        return;
      }
      setError(getErrorMessage(submitError));
    } finally {
      if (requestId === requestIdRef.current) {
        abortControllerRef.current = null;
        loadingRef.current = false;
        setIsLoading(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    await submitChatMessage(trimmedMessage);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  if (status === "loading") {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl items-center justify-center border border-border bg-card p-5 text-center shadow-soft sm:min-h-[70vh] sm:rounded-lg sm:p-8">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">
            กำลังตรวจสอบสถานะการเข้าสู่ระบบ...
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            กรุณารอสักครู่ก่อนเริ่มแชท
          </p>
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl items-center justify-center border border-border bg-card p-5 text-center shadow-soft sm:min-h-[70vh] sm:rounded-lg sm:p-8">
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
            AI Chatbot
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">
            กรุณาเข้าสู่ระบบก่อนเริ่มแชท
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            ระบบจะตรวจสอบผู้ใช้งานและ property ก่อนเปิดใช้งาน AI chat
          </p>
          <Button type="button" onClick={() => void signIn()} className="mt-5">
            <LogIn className="mr-2 h-4 w-4" />
            เข้าสู่ระบบ
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex h-[calc(100dvh-7.5rem)] w-full max-w-4xl flex-col border border-border bg-card shadow-soft sm:min-h-[32rem] sm:rounded-lg desktop:h-[calc(100dvh-3rem)] desktop:min-h-[40rem]">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
            AI Chatbot
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">
            ผู้ช่วยงานซ่อมบำรุง
          </h1>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <HeaderPropertyList />
          <Button
            type="button"
            variant="outline"
            onClick={startNewChat}
            disabled={!hasProperty && history.length === 0}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            แชทใหม่
          </Button>
        </div>
      </div>

      <div
        ref={messageListRef}
        className="flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-3 py-4 sm:space-y-4 sm:px-5 sm:py-5"
        role="log"
        aria-label="ข้อความสนทนากับผู้ช่วย AI"
        aria-live="polite"
        aria-busy={isLoading}
      >
        {!hasProperty ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
            {availableProperties.length > 0
              ? "กรุณาเลือก property ด้านบนก่อนเริ่มแชท"
              : "ไม่พบ property สำหรับผู้ใช้นี้ กรุณาติดต่อผู้ดูแลระบบก่อนเริ่มแชท"}
          </div>
        ) : history.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-lg border border-dashed border-border bg-muted px-5 py-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">มีอะไรให้ช่วยครับ?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {greeting}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              สอบถามงานแจ้งซ่อม สถิติงาน และงานบำรุงรักษาเชิงป้องกันได้
            </p>
          </div>
        ) : (
          history.map((chatMessage) => (
            <article
              key={chatMessage.id}
              aria-label={chatMessage.role === "user" ? "ข้อความของคุณ" : "คำตอบจากผู้ช่วย AI"}
              className={cn(
                "flex",
                chatMessage.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "min-w-0 max-w-[92%] overflow-hidden rounded-lg px-3 py-2.5 text-sm leading-6 sm:max-w-[82%] sm:px-4 sm:py-3",
                  chatMessage.role === "user"
                    ? "bg-cyan-700 text-white"
                    : "border border-border bg-muted text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {chatMessage.content}
                </p>
                {chatMessage.role === "assistant" &&
                chatMessage.toolCalls?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    {chatMessage.toolCalls.map((toolCall) => (
                      <span
                        key={toolCall}
                        className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-1"
                      >
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
          <div className="flex justify-start" role="status">
            <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              กำลังรอคำตอบ...
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="mx-3 mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 sm:p-4"
      >
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading || !hasProperty}
                onClick={() => void submitChatMessage(action.message)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {action.label}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Textarea
            ref={textareaRef}
            aria-label="ข้อความถึงผู้ช่วย AI"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์ข้อความ..."
            rows={2}
            disabled={isLoading || !hasProperty}
            className="min-h-[52px] flex-1 resize-none text-base sm:text-sm"
          />
          <Button
            type="submit"
            disabled={!canSubmit}
            isLoading={isLoading}
            loadingText="กำลังส่ง"
          >
            <Send className="mr-2 h-4 w-4" />
            ส่ง
          </Button>
        </div>
      </form>
    </section>
  );
}
