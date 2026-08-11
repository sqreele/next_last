export interface AssigneePropertyRef {
  id: number;
  property_id: string;
  name: string;
}

export interface AssigneeRef {
  user_id: number;
  profile_id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  positions: string | null;
  properties: AssigneePropertyRef[];
}

export interface AssigneeOption {
  value: number;
  label: string;
  assignee: AssigneeRef;
}

export const ASSIGNEE_OPTIONS_ENDPOINT =
  "/api/v1/user-profiles/assignee-options/";

export function toAssigneeOption(assignee: AssigneeRef): AssigneeOption {
  return {
    value: assignee.user_id,
    label:
      assignee.display_name ||
      [assignee.first_name, assignee.last_name].filter(Boolean).join(" ") ||
      assignee.username ||
      assignee.email,
    assignee,
  };
}

export function buildJobReassignPayload(
  assignee: AssigneeRef,
  note: string,
): { user_id: number; note?: string } {
  const normalizedNote = note.trim();
  return {
    user_id: assignee.user_id,
    ...(normalizedNote ? { note: normalizedNote } : {}),
  };
}
