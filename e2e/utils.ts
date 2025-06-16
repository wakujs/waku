import net from 'node:net';
import { execSync, exec } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cpSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ChildProcess } from 'node:child_process';
import { expect, test as basicTest } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import { error, info } from '@actions/core';

export type TestOptions = {
  mode: 'DEV' | 'PRD';
  page: Page;
};

export async function findWakuPort(cp: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    function listener(data: unknown) {
      const str = `${data}`;
      const match = str.match(/http:\/\/localhost:(\d+)/g);
      if (match) {
        clearTimeout(timer);
        cp.stdout?.off('data', listener);
        const url = new URL(match[0]);
        info(`Waku server started at ${url}`);
        resolve(parseInt(url.port, 10));
      }
    }
    cp.stdout?.on('data', listener);
    const timer = setTimeout(() => {
      cp.stdout?.off('data', listener);
      reject(new Error('Timeout while waiting for port'));
    }, 10_000);
  });
}

// Upstream doesn't support ES module
//  Related: https://github.com/dwyl/terminate/pull/85
export const terminate = createRequire(import.meta.url)(
  // use terminate instead of cp.kill,
  //  because cp.kill will not kill the child process of the child process
  //  to avoid the zombie process
  'terminate/promise',
) as (pid: number) => Promise<void>;

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
  const startApp = async (mode: 'DEV' | 'PRD' | 'STATIC') => {
    if (mode !== 'DEV' && !built) {
      rmSync(`${fixtureDir}/dist`, { recursive: true, force: true });
      execSync(`node ${waku} build`, { cwd: fixtureDir });
      built = true;
    }
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${waku} dev`;
        break;
      case 'PRD':
        cmd = `node ${waku} start`;
        break;
      case 'STATIC':
        cmd = `pnpm serve dist/public`;
        break;
    }
    const cp = exec(cmd, { cwd: fixtureDir });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    const port = await findWakuPort(cp);
    const stopApp = async () => {
      await terminate(cp.pid!);
    };
    return { port, stopApp, fixtureDir };
  };
  return startApp;
};

export const prepareStandaloneSetup = (fixtureName: string) => {
  const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
  const { version } = createRequire(import.meta.url)(
    join(wakuDir, 'package.json'),
  );
  const fixtureDir = fileURLToPath(
    new URL('./fixtures/' + fixtureName, import.meta.url),
  );
  // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
  // Which will cause files in `src` folder to be empty. I don't know why
  const tmpDir = process.env.TEMP_DIR || tmpdir();
  let standaloneDir: string | undefined;
  let built = false;
  const startApp = async (
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
      execSync(`pnpm pack --pack-destination ${standaloneDir}`, {
        cwd: wakuDir,
      });
      const wakuPackageTgz = join(standaloneDir, `waku-${version}.tgz`);
      execSync(`${packageManager} install`, { cwd: standaloneDir });
      execSync(`${packageManager} add ${wakuPackageTgz}`, {
        cwd: join(standaloneDir),
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
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} dev`;
        break;
      case 'PRD':
        cmd = `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start`;
        break;
      case 'STATIC':
        cmd = `node ${join(standaloneDir, './node_modules/serve/build/main.js')} dist/public`;
        break;
    }
    const cp = exec(cmd, { cwd: join(standaloneDir, packageDir) });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    const port = await findWakuPort(cp);
    const stopApp = async () => {
      await terminate(cp.pid!);
    };
    return { port, stopApp, standaloneDir };
  };
  return startApp;
};
