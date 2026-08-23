import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProfilePatch,
  hasProfileChanges,
  profileErrorMessage,
  profileFieldErrors,
} from "../app/lib/profile-request.mjs";

const initial = {
  first_name: "Alice",
  last_name: "Example",
  positions: "Engineer",
};

describe("profile form contract", () => {
  it("keeps save disabled while the editable fields are unchanged", () => {
    assert.equal(hasProfileChanges(initial, { ...initial }), false);
    assert.deepEqual(buildProfilePatch(initial, { ...initial }), {});
  });

  it("sends only changed allowlisted fields", () => {
    const current = { ...initial, positions: "Chief Engineer" };
    assert.equal(hasProfileChanges(initial, current), true);
    assert.deepEqual(buildProfilePatch(initial, current), {
      positions: "Chief Engineer",
    });
  });

  it("maps backend validation errors to editable fields", () => {
    assert.deepEqual(
      profileFieldErrors({ first_name: ["Too long."], email: ["Read-only."] }),
      { first_name: "Too long." },
    );
  });

  it("preserves useful API error detail", () => {
    assert.equal(
      profileErrorMessage({ detail: "Authentication required." }),
      "Authentication required.",
    );
    assert.equal(profileErrorMessage(null), "Unable to save your profile.");
  });
});
