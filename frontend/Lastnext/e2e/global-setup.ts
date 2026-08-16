import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FullConfig } from "@playwright/test";
import { createAuthenticatedStorageState } from "./support/auth";

export default async function globalSetup(config: FullConfig) {
  if (process.env.E2E_TESTING !== "1") {
    throw new Error("E2E_TESTING=1 is required; refusing to create browser auth state.");
  }

  const { statePath, state } = await createAuthenticatedStorageState(config);
  const configDirectory = config.configFile
    ? dirname(config.configFile)
    : process.cwd();
  const absolutePath = resolve(configDirectory, statePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(state), { mode: 0o600 });
}
