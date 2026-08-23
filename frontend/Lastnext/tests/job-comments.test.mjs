import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendAuthoritativeComment,
  buildJobCommentsUrl,
  canSubmitJobComment,
  getCommentsViewState,
  normalizeJobCommentsResponse,
} from "../app/lib/job-comments.mjs";

const comment = (id, text = `Comment ${id}`) => ({
  id,
  job: 1,
  comment: text,
  created_at: "2026-08-23T10:00:00Z",
  updated_at: "2026-08-23T10:00:00Z",
});

describe("Job Comments contract", () => {
  it("requires external Job and Property identities", () => {
    assert.equal(buildJobCommentsUrl({ jobId: "j1", propertyId: null }), null);
    assert.equal(buildJobCommentsUrl({ jobId: null, propertyId: "P1" }), null);
    assert.equal(
      buildJobCommentsUrl({ jobId: "j26ABC", propertyId: "P00A12BC" }),
      "/api/jobs/j26ABC/comments/?property_id=P00A12BC",
    );
  });

  it("keeps loading separate from empty", () => {
    assert.equal(
      getCommentsViewState({ loading: true, error: null, comments: [] }),
      "loading",
    );
  });

  it("keeps errors separate from empty", () => {
    assert.equal(
      getCommentsViewState({
        loading: false,
        error: "Forbidden",
        comments: [],
      }),
      "error",
    );
  });

  it("shows empty only after a successful empty response", () => {
    assert.equal(
      getCommentsViewState({ loading: false, error: null, comments: [] }),
      "empty",
    );
  });

  it("keeps queued offline comments visible after a successful empty response", () => {
    assert.equal(
      getCommentsViewState({
        loading: false,
        error: null,
        comments: [],
        pendingCount: 1,
      }),
      "ready",
    );
  });

  it("normalizes one or multiple server comments", () => {
    assert.deepEqual(normalizeJobCommentsResponse({ results: [comment(1)] }), [
      comment(1),
    ]);
    assert.equal(
      normalizeJobCommentsResponse({ results: [comment(1), comment(2)] })
        .length,
      2,
    );
  });

  it("disables empty, duplicate, and unauthorized submissions", () => {
    assert.equal(
      canSubmitJobComment({ text: "   ", submitting: false, canComment: true }),
      false,
    );
    assert.equal(
      canSubmitJobComment({
        text: "Update",
        submitting: true,
        canComment: true,
      }),
      false,
    );
    assert.equal(
      canSubmitJobComment({
        text: "Update",
        submitting: false,
        canComment: false,
      }),
      false,
    );
    assert.equal(
      canSubmitJobComment({
        text: "Update",
        submitting: false,
        canComment: true,
      }),
      true,
    );
  });

  it("appends the authoritative server response in stable order", () => {
    assert.deepEqual(appendAuthoritativeComment([comment(1)], comment(2)), [
      comment(1),
      comment(2),
    ]);
  });

  it("does not render an authoritative comment twice", () => {
    const existing = [comment(1)];
    assert.equal(appendAuthoritativeComment(existing, comment(1)), existing);
  });
});
