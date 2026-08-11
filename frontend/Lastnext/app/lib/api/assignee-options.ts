import {
  ASSIGNEE_OPTIONS_ENDPOINT,
  type AssigneePropertyRef,
  type AssigneeRef,
} from "./assignee-contracts";

function isPropertyRef(value: unknown): value is AssigneePropertyRef {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "number" &&
    "property_id" in value &&
    typeof value.property_id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function isAssigneeRef(value: unknown): value is AssigneeRef {
  if (typeof value !== "object" || value === null) return false;
  return (
    "user_id" in value &&
    typeof value.user_id === "number" &&
    "profile_id" in value &&
    typeof value.profile_id === "number" &&
    "username" in value &&
    typeof value.username === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "first_name" in value &&
    typeof value.first_name === "string" &&
    "last_name" in value &&
    typeof value.last_name === "string" &&
    "display_name" in value &&
    typeof value.display_name === "string" &&
    "positions" in value &&
    (typeof value.positions === "string" || value.positions === null) &&
    "properties" in value &&
    Array.isArray(value.properties) &&
    value.properties.every(isPropertyRef)
  );
}

export async function fetchAssigneeOptions(
  accessToken: string,
): Promise<AssigneeRef[]> {
  const response = await fetch(ASSIGNEE_OPTIONS_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch assignee options: ${response.status} ${response.statusText}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !payload.every(isAssigneeRef)) {
    throw new Error("Invalid assignee options response");
  }
  return payload;
}
