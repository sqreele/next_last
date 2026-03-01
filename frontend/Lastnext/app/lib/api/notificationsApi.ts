import { API_CONFIG } from '../config';

export class NotificationsApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status: number, code: string = 'UNKNOWN_ERROR', details?: unknown) {
    super(message);
    this.name = 'NotificationsApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface NotificationsListResponse<T = unknown> {
  count: number;
  results: T[];
}

export interface UpcomingNotificationsResponse<T = unknown> extends NotificationsListResponse<T> {
  days: number;
}

export interface AllNotificationsResponse<T = unknown> {
  overdue_count: number;
  upcoming_count: number;
  total_count: number;
  days: number;
  results: T[];
}

export interface UpdateEmailNotificationsPayload {
  email_notifications_enabled: boolean;
}

export interface UpdateEmailNotificationsResponse {
  message: string;
  email_notifications_enabled: boolean;
  profile: unknown;
}

class NotificationsApiService {
  private async parseErrorResponse(response: Response): Promise<{ message?: string; code?: string; [key: string]: unknown }> {
    try {
      return await response.json();
    } catch {
      return { message: `HTTP ${response.status}`, code: 'HTTP_ERROR' };
    }
  }

  private async fetchWithAuth<T>(url: string, token: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new NotificationsApiError(
        errorData.message || `HTTP ${response.status}`,
        response.status,
        errorData.code || 'HTTP_ERROR',
        errorData
      );
    }

    return response.json() as Promise<T>;
  }

  async getOverdueNotifications<T = unknown>(token: string): Promise<NotificationsListResponse<T>> {
    const url = `${API_CONFIG.baseUrl}/api/v1/notifications/overdue/`;
    return this.fetchWithAuth<NotificationsListResponse<T>>(url, token);
  }

  async getUpcomingNotifications<T = unknown>(token: string, days: number = 7): Promise<UpcomingNotificationsResponse<T>> {
    const normalizedDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
    const url = `${API_CONFIG.baseUrl}/api/v1/notifications/upcoming/?days=${normalizedDays}`;
    return this.fetchWithAuth<UpcomingNotificationsResponse<T>>(url, token);
  }

  async getAllNotifications<T = unknown>(token: string, days: number = 7): Promise<AllNotificationsResponse<T>> {
    const normalizedDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
    const url = `${API_CONFIG.baseUrl}/api/v1/notifications/all/?days=${normalizedDays}`;
    return this.fetchWithAuth<AllNotificationsResponse<T>>(url, token);
  }

  async updateEmailNotifications(
    token: string,
    payload: UpdateEmailNotificationsPayload
  ): Promise<UpdateEmailNotificationsResponse> {
    const url = `${API_CONFIG.baseUrl}/api/v1/user-profiles/update_email_notifications/`;
    return this.fetchWithAuth<UpdateEmailNotificationsResponse>(url, token, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }
}

export const notificationsApi = new NotificationsApiService();
