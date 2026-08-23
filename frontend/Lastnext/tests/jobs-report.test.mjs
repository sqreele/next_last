import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertJobsReportPropertyBoundary,
  buildJobsReportCsvUrl,
  buildJobsReportParams,
  canExportJobsReport,
  getCsvFilename,
  getJobsReportDetailHref,
  isCurrentJobsReportRequest,
} from "../app/lib/jobs-report.mjs";

describe("Jobs Report contract", () => {
  it("does not build a report request without an active Property", () => {
    assert.equal(buildJobsReportParams({ propertyId: null }), null);
    assert.equal(buildJobsReportCsvUrl({ propertyId: "" }), null);
  });

  it("preserves the external Property identity", () => {
    const url = buildJobsReportCsvUrl({ propertyId: "P00A12BC" });
    assert.match(url, /property_id=P00A12BC/);
  });

  it("serializes the screen filters into the CSV request", () => {
    const url = buildJobsReportCsvUrl({
      propertyId: "PA",
      filters: {
        status: "completed",
        priority: "high",
        pm: "pm",
        topic: "12",
        user: "34",
        month: "8",
        year: "2026",
        createdFrom: "2026-08-01",
        createdTo: "2026-08-23",
        search: "pump room",
      },
    });
    const params = new URL(url, "https://example.test").searchParams;
    assert.deepEqual(Object.fromEntries(params), {
      property_id: "PA",
      status: "completed",
      priority: "high",
      pm: "pm",
      topic: "12",
      user: "34",
      month: "8",
      year: "2026",
      created_from: "2026-08-01",
      created_to: "2026-08-23",
      search: "pump room",
    });
  });

  it("omits all-filter sentinels without dropping Property scope", () => {
    const params = buildJobsReportParams({
      propertyId: "PA",
      filters: { status: "all", priority: "all", search: "" },
    });
    assert.equal(params.toString(), "property_id=PA");
  });

  it("rejects stale Property responses", () => {
    assert.equal(
      isCurrentJobsReportRequest({
        requestId: 1,
        currentRequestId: 2,
        requestPropertyId: "PA",
        currentPropertyId: "PB",
      }),
      false,
    );
  });

  it("rejects cross-Property report payloads", () => {
    assert.throws(
      () => assertJobsReportPropertyBoundary([{ property_id: "PB" }], "PA"),
      /crossed the active Property boundary/,
    );
  });

  it("uses external Job and Property identities for detail navigation", () => {
    assert.equal(
      getJobsReportDetailHref("j26ABC", "P00A12BC"),
      "/dashboard/jobs/j26ABC?property_id=P00A12BC",
    );
  });

  it("disables export without rows, Property, or while exporting", () => {
    assert.equal(canExportJobsReport({ propertyId: null, rowCount: 2, exporting: false }), false);
    assert.equal(canExportJobsReport({ propertyId: "PA", rowCount: 0, exporting: false }), false);
    assert.equal(canExportJobsReport({ propertyId: "PA", rowCount: 2, exporting: true }), false);
    assert.equal(canExportJobsReport({ propertyId: "PA", rowCount: 2, exporting: false }), true);
  });

  it("uses the server-provided external-Property filename", () => {
    assert.equal(
      getCsvFilename(
        'attachment; filename="jobs-report-P00A12BC-2026-08-23.csv"',
        "fallback.csv",
      ),
      "jobs-report-P00A12BC-2026-08-23.csv",
    );
  });

  it("falls back safely when the export response omits a filename", () => {
    assert.equal(getCsvFilename(null, "jobs-report.csv"), "jobs-report.csv");
  });
});
