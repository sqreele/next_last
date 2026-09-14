import "server-only";

import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import { getServerSession } from "@/app/lib/session.server";

export async function platformGet(path: string): Promise<Record<string, unknown>> {
  const session = await getServerSession();
  const token = session?.user?.accessToken;
  if (!token) throw new Error("Platform session is unavailable.");
  const response = await backendFetch(`${API_CONFIG.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Platform data is unavailable (${response.status}).`);
  return response.json() as Promise<Record<string, unknown>>;
}
