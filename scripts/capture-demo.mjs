import { createRequire } from 'node:module';
import { mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../apps/staff-web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(root + 'docs/images', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1536, height: 1024 },
  reducedMotion: 'reduce',
  recordVideo: { dir: root + 'docs/images', size: { width: 1536, height: 1024 } }
});
const page = await context.newPage();
await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:43180');
await page.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
await page.screenshot({ path: root + 'docs/images/dashboard.png', fullPage: true });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Start sample call', exact: true }).click();
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Next turn', exact: true }).click();
}
await page.screenshot({ path: root + 'docs/images/confirmation.png', fullPage: true });
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
const card = page.getByTestId('order-card').filter({ hasText: 'Alex Morgan' });
await card.waitFor();
await page.screenshot({ path: root + 'docs/images/order-created.png', fullPage: true });
for (const label of ['Accept order', 'Start preparing', 'Mark ready']) {
  await page.waitForTimeout(1200);
  await card.getByRole('button', { name: label, exact: true }).click();
}
await page.getByRole('button', { name: 'Menu & availability', exact: true }).click();
await page.screenshot({ path: root + 'docs/images/menu.png', fullPage: true });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'How it works', exact: true }).click();
await page.screenshot({ path: root + 'docs/images/architecture.png', fullPage: true });
await page.waitForTimeout(1600);
const video = page.video();
await context.close();
await rename(await video.path(), root + 'docs/images/walkthrough.webm');
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:43180');
await mobile.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
await mobile.screenshot({ path: root + 'docs/images/mobile.png', fullPage: true });
await browser.close();
console.log('Screenshots and walkthrough saved in docs/images.');
