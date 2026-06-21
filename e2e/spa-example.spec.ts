import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('spa-example');

test.describe('spa example coverage', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('renders client-only root and can call a server function in dev', async ({
    page,
    mode,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('title')).toHaveText('Hello Client');
    await expect(page.getByTestId('count')).toHaveText('Count: 0');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('count')).toHaveText('Count: 1');
    if (mode !== 'DEV') {
      return;
    }
    await page.getByRole('button', { name: 'Greet' }).click();
    await expect(page.getByTestId('server-greeting')).toHaveText(
      'Hello from server',
    );
  });
});
