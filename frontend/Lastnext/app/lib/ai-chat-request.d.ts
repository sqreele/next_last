export interface AiChatStartState {
  message: string;
  requestInFlight: boolean;
  isAuthenticated: boolean;
  propertyId: string | null | undefined;
}

export interface AiChatCurrentRequestState {
  requestId: number;
  currentRequestId: number;
  requestPropertyId: string;
  currentPropertyId: string | null;
}

export function canStartAiChatRequest(state: AiChatStartState): boolean;
export function isCurrentAiChatRequest(
  state: AiChatCurrentRequestState,
): boolean;
