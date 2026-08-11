import { useCallback, useEffect, useState } from "react";
import type { AssigneeRef } from "@/app/lib/api/assignee-contracts";
import { fetchAssigneeOptions } from "@/app/lib/api/assignee-options";
import { useSession } from "@/app/lib/session.client";
import { logger } from "@/app/lib/utils/logger";

export function useAssigneeOptions() {
  const [assignees, setAssignees] = useState<AssigneeRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();
  const accessToken = session?.user?.accessToken;

  const refetch = useCallback(async () => {
    if (!accessToken) {
      setAssignees([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setAssignees(await fetchAssigneeOptions(accessToken));
    } catch (caught: unknown) {
      logger.error("Error fetching assignee options", caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to fetch assignee options",
      );
      setAssignees([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { assignees, loading, error, refetch };
}

