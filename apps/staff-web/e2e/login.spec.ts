import { expect, test } from '@playwright/test';

test('shows login error on failed auth', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHORIZED' } })
    });
  });

  await page.goto('/staff');
  await expect(page.getByRole('heading', { name: 'Staff Login' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('login failed')).toBeVisible();
});
