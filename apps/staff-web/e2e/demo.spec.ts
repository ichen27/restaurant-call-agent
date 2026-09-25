import { expect, test } from '@playwright/test';

test('visitor confirms a pickup order and staff complete it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start sample call', exact: true }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next turn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm order', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
  const card = page.getByTestId('order-card').filter({ hasText: 'Alex Morgan' });
  await expect(card).toContainText('$35.50');
  await card.getByRole('button', { name: 'Accept order', exact: true }).click();
  await card.getByRole('button', { name: 'Start preparing', exact: true }).click();
  await card.getByRole('button', { name: 'Mark ready', exact: true }).click();
  await card.getByRole('button', { name: 'Complete order', exact: true }).click();
  await expect(card).not.toBeVisible();
  await page.getByRole('button', { name: 'Call history', exact: true }).click();
  await expect(page.getByText('Alex Morgan', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('unavailable item escalates without creating an order', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Sample call scenario').selectOption('unavailable');
  await page.getByRole('button', { name: 'Start sample call', exact: true }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next turn', exact: true }).click();
  await expect(page.getByText('Staff handoff requested', { exact: true })).toBeVisible();
  await expect(page.getByTestId('order-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start sample call', exact: true })).toBeVisible();
});

test('mobile layout supports menu controls and has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu & availability', exact: true }).click();
  const item = page.getByTestId('menu-item').filter({ hasText: 'Sesame chicken' });
  await item.getByRole('switch').click();
  await expect(item.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
