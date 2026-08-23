import assert from "node:assert/strict";
import test from "node:test";

import {
  canStartAiChatRequest,
  isCurrentAiChatRequest,
} from "../app/lib/ai-chat-request.mjs";

const ready = {
  message: "งานแจ้งซ่อมวันนี้",
  requestInFlight: false,
  isAuthenticated: true,
  propertyId: "P-ALLOWED",
};

test("send is disabled for empty input", () => {
  assert.equal(canStartAiChatRequest({ ...ready, message: "  " }), false);
});

test("an in-flight request blocks duplicate submit", () => {
  assert.equal(
    canStartAiChatRequest({ ...ready, requestInFlight: true }),
    false,
  );
  assert.equal(canStartAiChatRequest(ready), true);
});

test("send requires authentication and a canonical property", () => {
  assert.equal(
    canStartAiChatRequest({ ...ready, isAuthenticated: false }),
    false,
  );
  assert.equal(canStartAiChatRequest({ ...ready, propertyId: null }), false);
});

test("late responses cannot cross a property or request boundary", () => {
  const current = {
    requestId: 4,
    currentRequestId: 4,
    requestPropertyId: "P-A",
    currentPropertyId: "P-A",
  };

  assert.equal(isCurrentAiChatRequest(current), true);
  assert.equal(
    isCurrentAiChatRequest({ ...current, currentPropertyId: "P-B" }),
    false,
  );
  assert.equal(
    isCurrentAiChatRequest({ ...current, currentRequestId: 5 }),
    false,
  );
});
