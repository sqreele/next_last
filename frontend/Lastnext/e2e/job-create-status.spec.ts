import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("creates one authorized job and persists its updated status", async ({ page }) => {
  test.setTimeout(60_000);
  const jobDescription = `E2E Job Smoke ${Date.now()}`;
  let createRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/jobs/") {
      createRequestCount += 1;
    }
  });

  const sessionReady = page.waitForResponse((response) =>
    response.url().includes("/api/auth/session-compat") && response.status() === 200,
  );
  const propertyAreasReady = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/areas/" &&
      url.searchParams.has("property_id") &&
      response.status() === 200;
  });
  await page.goto("/dashboard/create-job");
  await sessionReady;
  await expect(page.getByRole("button", { name: "Select property" })).toContainText(
    "E2E Property Alpha",
  );
  await propertyAreasReady;
  await expect(page.getByRole("heading", { name: "Create a maintenance job" })).toBeVisible();
  await page.getByLabel("Job Description").fill(jobDescription);

  const areaField = page
    .locator("#cj-step-2 label")
    .filter({ hasText: "Area / Zone" })
    .locator("..")
    .getByRole("combobox");
  await areaField.click();
  await page.getByRole("option", { name: /E2E Area Alpha/ }).click();

  await page.getByRole("button", { name: /Search categories/ }).click();
  await page.getByRole("option", { name: /E2E Job Smoke Topic/ }).click();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "e2e-job-smoke.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });

  const createResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/jobs/" &&
    response.status() === 200,
  );
  const createButton = page.getByRole("button", { name: "Create maintenance job" });
  await createButton.focus();
  await page.keyboard.press("Enter");
  const createdJob = (await createResponse).json() as Promise<{ job_id: string }>;
  const { job_id: jobId } = await createdJob;
  expect(jobId).toBeTruthy();
  expect(createRequestCount).toBe(1);

  await page.waitForURL(/\/dashboard\/my-jobs\/?$/);
  const jobCard = page.locator("article").filter({ hasText: jobDescription });
  await expect(jobCard).toBeVisible();
  await expect(jobCard).toContainText("Pending");

  await jobCard.getByRole("button", { name: "Update Status" }).click();
  const statusDialog = page.getByRole("dialog", { name: "Update Job Status" });
  await statusDialog.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "In Progress" }).click();
  const statusResponse = page.waitForResponse((response) =>
    response.request().method() === "PATCH" &&
    new URL(response.url()).pathname === `/api/v1/jobs/${jobId}/` &&
    response.status() === 200,
  );
  await statusDialog.getByRole("button", { name: "Update", exact: true }).click();
  await statusResponse;
  await expect(jobCard).toContainText("In Progress");

  await page.reload();
  const persistedJobCard = page.locator("article").filter({ hasText: jobDescription });
  await expect(persistedJobCard).toBeVisible();
  await expect(persistedJobCard).toContainText("In Progress");
});
