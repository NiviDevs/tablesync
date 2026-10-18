import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.E2E_STATE_PATH ??= join(tmpdir(), `tablesync-e2e-${process.pid}.json`);
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 60000, expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'off', screenshot: 'off' },
  webServer: { command: 'node ../../scripts/e2e-server.mjs', url: 'http://127.0.0.1:3100/app',
    reuseExistingServer: false, timeout: 120000, env: { E2E_STATE_PATH: process.env.E2E_STATE_PATH } },
});
