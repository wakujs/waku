import { networkInterfaces } from 'node:os';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('performance-track');
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((address) => address?.family === 'IPv4' && !address.internal)?.address;

for (const host of ['localhost', lanAddress]) {
  test(`public host navigation via ${host ?? 'LAN'}`, async ({ page }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!host, 'No non-loopback IPv4 address is available');
    const { port, stopApp } = await startApp('DEV', {
      portFlag: '--host 0.0.0.0 --port',
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    try {
      await page.goto(`http://${host}:${port}/`);
      expect(await page.evaluate(() => window.isSecureContext)).toBe(
        host === 'localhost',
      );
      expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe(
        host === 'localhost' ? 'function' : 'undefined',
      );
      await expect(
        page.getByText('HomeSlowServerComponent resolved after 500ms'),
      ).toBeVisible();
      await waitForHydration(page);

      await page.getByRole('link', { name: 'About' }).click();
      await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
      await expect(
        page.getByText('AboutSlowServerComponent resolved after 500ms'),
      ).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await stopApp();
    }
  });
}
