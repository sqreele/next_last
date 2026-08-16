import { expect, test } from "@playwright/test";

type SessionProperty = {
  property_id?: string | number;
  id?: string | number;
  name?: string;
};

test("hydrates authorized properties and switches inventory context", async ({ page }) => {
  const sessionReady = page.waitForResponse((response) =>
    response.url().includes("/api/auth/session-compat") && response.status() === 200,
  );

  await page.goto("/dashboard/inventory");
  const sessionResponse = await sessionReady;
  const session = await sessionResponse.json();
  const properties = (session?.user?.properties ?? []) as SessionProperty[];
  const propertyA = properties.find((property) => property.name === "E2E Property Alpha");
  const propertyB = properties.find((property) => property.name === "E2E Property Beta");
  expect(propertyA, "Property Alpha must be present in the real session").toBeTruthy();
  expect(propertyB, "Property Beta must be present in the real session").toBeTruthy();

  const propertyBId = String(propertyB?.property_id ?? propertyB?.id);
  const selector = page.getByLabel("Select property").filter({ visible: true });
  await expect(selector).toContainText("E2E Property Alpha");
  await expect(page.getByRole("button", { name: "No Properties" })).toHaveCount(0);
  await expect(page.getByText("E2E Inventory Alpha", { exact: true }).first()).toBeVisible();

  await selector.click();
  await expect(page.getByRole("menuitem", { name: "E2E Property Beta" })).toBeVisible();
  const propertyBInventory = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith("/api/v1/inventory/") &&
      url.searchParams.get("property_id") === propertyBId &&
      response.status() === 200
    );
  });
  await page.getByRole("menuitem", { name: "E2E Property Beta" }).click();
  await propertyBInventory;

  await expect(selector).toContainText("E2E Property Beta");
  await expect(page.getByText("E2E Inventory Beta", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("E2E Inventory Alpha", { exact: true })).toHaveCount(0);
});
