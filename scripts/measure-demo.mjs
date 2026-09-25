import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const require = createRequire(new URL('../apps/staff-web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
const samples = [];
for (let i = 0; i < 10; i++) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Start sample call', exact: true }).click();
  for (let turn = 0; turn < 4; turn++) await page.getByRole('button', { name: 'Next turn', exact: true }).click();
  const started = performance.now();
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
  await page.getByTestId('order-card').filter({ hasText: 'Alex Morgan' }).waitFor();
  samples.push(Math.round(performance.now() - started));
  await context.close();
}
await browser.close();
const sorted = [...samples].sort((a, b) => a - b);
console.log(JSON.stringify({ metric: 'confirmation-click-to-visible-order', samplesMs: samples,
  medianMs: (sorted[4] + sorted[5]) / 2, p95Ms: sorted[9], n: samples.length }, null, 2));
