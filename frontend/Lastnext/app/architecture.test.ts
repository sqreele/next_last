import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const legacyRoutes = [
  ["dashboard/createJob/page.tsx", "/dashboard/createJob"],
  ["dashboard/myJobs/page.tsx", "/dashboard/myJobs"],
  ["dashboard/Preventive_maintenance/page.tsx", "/dashboard/Preventive_maintenance"],
  ["dashboard/chartdashboad/page.tsx", "/dashboard/chartdashboad"],
] as const;

describe("route architecture", () => {
  it.each(legacyRoutes)("keeps %s as a redirect without a duplicate route file", async (routeFile, source) => {
    const absoluteRoute = path.join(process.cwd(), "app", routeFile);
    await expect(access(absoluteRoute, constants.F_OK)).rejects.toBeDefined();

    const nextConfig = await readFile(path.join(process.cwd(), "next.config.mjs"), "utf8");
    expect(nextConfig).toContain(`source: '${source}`);
  });
});
