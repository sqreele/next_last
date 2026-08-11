import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSIGNEE_OPTIONS_ENDPOINT,
  buildJobReassignPayload,
  toAssigneeOption,
  type AssigneeRef,
} from "./assignee-contracts";
import { fetchAssigneeOptions } from "./assignee-options";
import type { MachineCreatePayload } from "./machine-contracts";

const assignee: AssigneeRef = {
  user_id: 41,
  profile_id: 83,
  username: "engineer",
  email: "engineer@example.com",
  first_name: "Example",
  last_name: "Engineer",
  display_name: "Example Engineer",
  positions: "Engineer",
  properties: [{ id: 7, property_id: "P00000007", name: "Hotel Seven" }],
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canonical assignee option contract", () => {
  it("loads the canonical raw-array endpoint without identity fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([assignee]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAssigneeOptions("access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      ASSIGNEE_OPTIONS_ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
    expect(result).toEqual([assignee]);
  });

  it("accepts the backend nullable positions field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ ...assignee, positions: null }])),
    );

    await expect(fetchAssigneeOptions("access-token")).resolves.toEqual([
      { ...assignee, positions: null },
    ]);
  });

  it("keeps User and UserProfile identities distinct", () => {
    expect(assignee.user_id).not.toBe(assignee.profile_id);
    expect(toAssigneeOption(assignee).value).toBe(assignee.user_id);
    expect(toAssigneeOption(assignee).value).not.toBe(assignee.profile_id);
  });

  it("uses the backend display name without changing picker presentation", () => {
    expect(toAssigneeOption(assignee)).toMatchObject({
      value: 41,
      label: "Example Engineer",
      assignee,
    });
  });

  it("builds the Job payload with the canonical User primary key", () => {
    expect(buildJobReassignPayload(assignee, "  handover  ")).toEqual({
      user_id: 41,
      note: "handover",
    });
  });

  it("rejects the legacy detailed-profile shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([{ id: 83, username: "engineer", properties: [] }]),
      ),
    );

    await expect(fetchAssigneeOptions("access-token")).rejects.toThrow(
      "Invalid assignee options response",
    );
  });

  it("preserves property-scoped references used by the picker", () => {
    expect(toAssigneeOption(assignee).assignee.properties).toEqual([
      { id: 7, property_id: "P00000007", name: "Hotel Seven" },
    ]);
  });

  it("does not force the Machine write contract onto User identity", () => {
    type MachineHasAssignee =
      "assigned_to" extends keyof MachineCreatePayload ? true : false;
    const machineHasAssignee: MachineHasAssignee = false;

    expect(machineHasAssignee).toBe(false);
  });
});
