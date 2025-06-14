import net from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { exec, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import type { ConsoleMessage, Page } from '@playwright/test';
import { type Browser, expect, test as basicTest } from '@playwright/test';
import { error, info } from '@actions/core';

export type TestOptions = {
  mode: 'DEV' | 'PRD';
  page: Page;
};

const unexpectedErrors: RegExp[] = [
  /^You did not run Node.js with the `--conditions react-server` flag/,
  /^\(node:14372\)/,
  /^Warning: Expected server HTML to contain a matching/,
];

const ignoreErrors: RegExp[] = [
  /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  /^Error: Unexpected error\s+at ThrowsComponent/,
  /^Error: Something unexpected happened\s+at ErrorRender/,
  /^Error: 401 Unauthorized\s+at CheckIfAccessDenied/,
  /^Error: Not Found\s+at SyncPage/,
  /^Error: Redirect\s+at createCustomError/,
  // FIXME Is this too general and miss meaningful errors?
  /^\[Error: An error occurred in the Server Components render./,
];

export async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => {
        resolve(port);
      });
    });
  });
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      if ((err as any).code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    srv.once('listening', () => {
      srv.close();
      resolve(true);
    });
    srv.listen(port);
  });
}

export function debugChildProcess(cp: ChildProcess, sourceFile: string) {
  cp.stdout?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    if (ignoreErrors?.some((re) => re.test(str))) {
      return;
    }
    info(`(${sourceFile}) stdout: ${str}`);
    console.log(`(${sourceFile}) stdout: ${str}`);
  });

  cp.stderr?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    if (ignoreErrors?.some((re) => re.test(str))) {
      return;
    }
    error(`stderr: ${str}`, {
      title: 'Child Process Error',
      file: sourceFile,
    });
    console.error(`(${sourceFile}) stderr: ${str}`);
  });
}

export const test = basicTest.extend<TestOptions>({
  mode: 'DEV',
  page: async ({ page }, pageUse, testInfo) => {
    const callback = (msg: ConsoleMessage) => {
      if (unexpectedErrors.some((re) => re.test(msg.text()))) {
        throw new Error(msg.text());
      }
      console.log(`(${testInfo.title}) ${msg.type()}: ${msg.text()}`);
    };
    page.on('console', callback);
    await pageUse(page);
    page.off('console', callback);
  },
});

export const prepareNormalSetup = (fixtureName: string) => {
  const waku = fileURLToPath(
    new URL('../packages/waku/dist/cli.js', import.meta.url),
  );
  const fixtureDir = fileURLToPath(
    new URL('./fixtures/' + fixtureName, import.meta.url),
  );
  let built = false;
  return async function startApp(
    _browser: Browser,
    mode: 'DEV' | 'PRD' | 'STATIC',
  ) {
    if (mode !== 'DEV' && !built) {
      rmSync(`${fixtureDir}/dist`, { recursive: true, force: true });
      execSync(`node ${waku} build`, { cwd: fixtureDir, stdio: 'inherit' });
      built = true;
    }
    const port = await getFreePort();
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${waku} dev --port ${port}`;
        break;
      case 'PRD':
        cmd = `node ${waku} start --port ${port}`;
        break;
      case 'STATIC':
        cmd = `pnpm serve -l ${port} dist/public`;
        break;
    }
    const cp = exec(cmd, { cwd: fixtureDir });
    console.debug('Attempting to start app with command:', cmd);
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    await new Promise<void>((resolve) => {
      cp.stdout!.on('data', (data) => {
        const str = data.toString();
        if (str.includes('http://')) {
          resolve();
        }
      });
    });
    const stopApp = async () => {
      return new Promise<void>((resolve) => {
        cp.on('exit', resolve);
        cp.kill('SIGINT');
      });
    };
    return { port, stopApp, fixtureDir };
  };
};

export const prepareStandaloneSetup = (fixtureName: string) => {
  const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
  const { version } = createRequire(import.meta.url)(
    join(wakuDir, 'package.json'),
  );
  execSync('pnpm pack', {
    cwd: wakuDir,
  });
  const wakuTarball = join(wakuDir, `waku-${version}.tgz`);
  const fixtureDir = fileURLToPath(
    new URL('./fixtures/' + fixtureName, import.meta.url),
  );
  const tmpDir = os.tmpdir();
  let standaloneDir: string | undefined;
  let built = false;
  const startApp = async (
    _browser: Browser,
    mode: 'DEV' | 'PRD' | 'STATIC',
    packageManager: 'npm' | 'pnpm' | 'yarn' = 'npm',
    packageDir = '',
  ) => {
    if (!standaloneDir) {
      standaloneDir = mkdtempSync(join(tmpDir, fixtureName));
      cpSync(fixtureDir, standaloneDir, {
        filter: (src) => {
          return !src.includes('node_modules') && !src.includes('dist');
        },
        recursive: true,
      });
      execSync(`${packageManager} install --force`, {
        cwd: standaloneDir,
        stdio: 'inherit',
      });
      execSync(`${packageManager} add ${wakuTarball}`, {
        cwd: standaloneDir,
        stdio: 'inherit',
      });
    }
    if (mode !== 'DEV' && !built) {
      rmSync(`${join(standaloneDir, packageDir, 'dist')}`, {
        recursive: true,
        force: true,
      });
      execSync(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build`,
        { cwd: join(standaloneDir, packageDir) },
      );
      built = true;
    }
    const port = await getFreePort();
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} dev --port ${port}`;
        break;
      case 'PRD':
        cmd = `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start --port ${port}`;
        break;
      case 'STATIC':
        cmd = `node ${join(standaloneDir, './node_modules/serve/build/main.js')} dist/public -p ${port}`;
        break;
    }
    const cp = exec(cmd, { cwd: join(standaloneDir, packageDir) });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    const stopApp = async () => {
      return new Promise<void>((resolve) => {
        cp.on('exit', () => resolve());
        cp.kill('SIGINT');
      });
    };
    await new Promise<void>((resolve) => {
      cp.stdout!.on('data', (data) => {
        const str = data.toString();
        if (str.includes('http://')) {
          resolve();
        }
      });
    });
    return { port, stopApp, standaloneDir };
  };
  return startApp;
};
