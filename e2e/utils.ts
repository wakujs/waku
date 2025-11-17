import { exec } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify, stripVTControlCharacters } from 'node:util';
import { error, info } from '@actions/core';
import { test as basicTest, expect } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import fkill from 'fkill';

const execAsync = promisify(exec);

export const FETCH_ERROR_MESSAGES = {
  chromium: 'Failed to fetch',
  firefox: 'NetworkError when attempting to fetch resource.',
  webkit: 'Load failed',
};

export type TestOptions = {
  mode: 'DEV' | 'PRD';
  page: Page;
};

export async function findWakuPort(cp: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    function listener(data: unknown) {
      const str = stripVTControlCharacters(`${data}`);
      const match = str.match(
        /http:\/\/(localhost|127\.0\.0\.1):(\d+)|on port (\d+)/,
      );
      if (match) {
        clearTimeout(timer);
        cp.stdout?.off('data', listener);
        const port = match[2] || match[3]!;
        info(`Waku server started at port ${port}`);
        resolve(parseInt(port, 10));
      }
    }
    cp.stdout?.on('data', listener);
    const timer = setTimeout(() => {
      cp.stdout?.off('data', listener);
      reject(new Error('Timeout while waiting for port'));
    }, 10_000);
  });
}

// Helper to get all child PIDs recursively
async function getChildPids(parentPid: number): Promise<number[]> {
  try {
    const { stdout } = await execAsync(`pgrep -P ${parentPid}`);
    const childPids = stdout
      .trim()
      .split('\n')
      .filter((pid) => pid)
      .map((pid) => parseInt(pid, 10));

    // Recursively get grandchildren
    const grandchildPids = await Promise.all(
      childPids.map((pid) => getChildPids(pid)),
    );

    return [...childPids, ...grandchildPids.flat()];
  } catch {
    // No children found or pgrep failed
    return [];
  }
}

// Upstream doesn't support ES module
//  Related: https://github.com/dwyl/terminate/pull/85
export const terminate = async (cp: ChildProcess) => {
  if (!cp.pid) {
    return;
  }

  try {
    // Get all child processes first
    const childPids = await getChildPids(cp.pid);
    const allPids = [cp.pid, ...childPids];

    // Kill all processes (children first, then parent)
    for (const pid of allPids.reverse()) {
      try {
        await fkill(pid, { force: true });
      } catch {
        // Process might already be dead
      }
    }
  } catch {
    // Fallback to just killing the parent
    try {
      cp.kill('SIGTERM');
    } catch {
      // Process might already be dead
    }
  }
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
  /^Error: Not Found\s+at AsyncPage/,
  /^Error: Redirect\s+at createCustomError/,
  // FIXME Is this too general and miss meaningful errors?
  /^\[Error: An error occurred in the Server Components render./,
];

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

export const test = basicTest.extend<
  Omit<TestOptions, 'mode'>,
  Pick<TestOptions, 'mode'>
>({
  mode: ['DEV', { option: true, scope: 'worker' }],
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
  const startApp = async (
    mode: 'DEV' | 'PRD' | 'STATIC',
    options?: { cmd?: string | undefined },
  ) => {
    if (mode !== 'DEV' && !built) {
      rmSync(`${fixtureDir}/dist`, { recursive: true, force: true });
      await execAsync(`node ${waku} build`, { cwd: fixtureDir });
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
        cmd = `pnpm http-server dist/public`;
        break;
    }
    if (options?.cmd) {
      cmd = options.cmd;
    }
    const cp = exec(cmd, { cwd: fixtureDir });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    const port = await findWakuPort(cp);
    const stopApp = async () => {
      await terminate(cp);
    };
    return { port, stopApp, fixtureDir };
  };
  return startApp;
};

const PACKAGE_INSTALL = {
  npm: `npm install --force`,
  pnpm: `pnpm install`,
  yarn: `yarn install`,
} as const;

const patchMonorepoPackageJson = (standaloneDir: string) => {
  const packagesDir = join(standaloneDir, 'packages');
  if (!existsSync(packagesDir)) {
    return;
  }
  const rootPackageJson = JSON.parse(
    readFileSync(join(standaloneDir, 'package.json'), 'utf8'),
  );
  const reactVersion = rootPackageJson.dependencies.react;
  if (!reactVersion) {
    return;
  }
  for (const dir of readdirSync(packagesDir)) {
    const packageJsonFile = join(packagesDir, dir, 'package.json');
    if (!existsSync(packageJsonFile)) {
      continue;
    }
    let modified = false;
    const packageJson = JSON.parse(readFileSync(packageJsonFile, 'utf8'));
    for (const key of Object.keys(packageJson.dependencies || {})) {
      if (key.startsWith('react')) {
        if (packageJson.dependencies[key] !== reactVersion) {
          packageJson.dependencies[key] = reactVersion;
          modified = true;
        }
      }
    }
    if (modified) {
      writeFileSync(packageJsonFile, JSON.stringify(packageJson), 'utf8');
    }
  }
};

export const makeTempDir = (prefix: string): string => {
  // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
  // Which will cause files in `src` folder to be empty. I don't know why
  const tmpDir = process.env.TEMP_DIR || tmpdir();
  return mkdtempSync(join(tmpDir, prefix));
};

export const prepareStandaloneSetup = (fixtureName: string) => {
  const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
  const { version } = createRequire(import.meta.url)(
    join(wakuDir, 'package.json'),
  );
  const fixtureDir = fileURLToPath(
    new URL('./fixtures/' + fixtureName, import.meta.url),
  );
  const standaloneDirMap = new Map<'npm' | 'pnpm' | 'yarn', string>();
  const builtModeMap = new Map<'npm' | 'pnpm' | 'yarn', 'PRD' | 'STATIC'>();
  const startApp = async (
    mode: 'DEV' | 'PRD' | 'STATIC',
    packageManager: 'npm' | 'pnpm' | 'yarn' = 'pnpm',
    packageDir = '',
  ) => {
    const wakuPackageDir = (): string => {
      if (!standaloneDir) {
        throw new Error('standaloneDir is not set');
      }
      return packageManager !== 'pnpm'
        ? standaloneDir
        : join(standaloneDir, packageDir);
    };
    let standaloneDir = standaloneDirMap.get(packageManager);
    if (!standaloneDir) {
      standaloneDir = makeTempDir(fixtureName);
      standaloneDirMap.set(packageManager, standaloneDir);
      cpSync(fixtureDir, standaloneDir, {
        filter: (src) => {
          return !src.includes('node_modules') && !src.includes('dist');
        },
        recursive: true,
      });
      await execAsync(`pnpm pack --pack-destination ${standaloneDir}`, {
        cwd: wakuDir,
      });
      const wakuPackageTgz = join(standaloneDir, `waku-${version}.tgz`);
      const rootPkg = JSON.parse(
        readFileSync(
          fileURLToPath(new URL('../package.json', import.meta.url)),
          'utf8',
        ),
      );
      const pnpmOverrides = {
        ...rootPkg.pnpm?.overrides,
        ...rootPkg.pnpmOverrides, // Do we need this?
        waku: `file:${wakuPackageTgz}`,
      };
      for (const file of readdirSync(standaloneDir, {
        encoding: 'utf8',
        recursive: true,
      })) {
        if (file.endsWith('package.json')) {
          const f = join(standaloneDir, file);
          const pkg = JSON.parse(readFileSync(f, 'utf8'));
          for (const deps of [pkg.dependencies, pkg.devDependencies]) {
            Object.keys(deps || {}).forEach((key) => {
              if (pnpmOverrides[key]) {
                deps[key] = pnpmOverrides[key];
              }
            });
          }
          if (file === 'package.json') {
            switch (packageManager) {
              case 'npm': {
                pkg.overrides = pnpmOverrides;
                break;
              }
              case 'pnpm': {
                pkg.pnpm = { overrides: pnpmOverrides };
                break;
              }
              case 'yarn': {
                pkg.resolutions = pnpmOverrides;
                break;
              }
            }
            if (packageManager === 'pnpm') {
              pkg.packageManager = rootPkg.packageManager;
            }
          }
          writeFileSync(f, JSON.stringify(pkg, null, 2), 'utf8');
        }
      }
      if (packageManager !== 'pnpm') {
        patchMonorepoPackageJson(standaloneDir);
      }
      await execAsync(PACKAGE_INSTALL[packageManager], {
        cwd: standaloneDir,
      });
    }
    const waku = join(wakuPackageDir(), './node_modules/waku/dist/cli.js');
    if (mode !== 'DEV' && builtModeMap.get(packageManager) !== mode) {
      rmSync(`${join(standaloneDir, packageDir, 'dist')}`, {
        recursive: true,
        force: true,
      });
      await execAsync(`node ${waku} build`, {
        cwd: join(standaloneDir, packageDir),
      });
      builtModeMap.set(packageManager, mode);
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
        cmd = `node ${join(standaloneDir, './node_modules/http-server/bin/http-server')} dist/public`;
        break;
    }
    const cp = exec(cmd, { cwd: join(standaloneDir, packageDir) });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    const port = await findWakuPort(cp);
    const stopApp = async () => {
      builtModeMap.delete(packageManager);
      await terminate(cp);
    };
    return { port, stopApp, standaloneDir };
  };
  return startApp;
};

export async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('body');
      if (el) {
        const keys = Object.keys(el);
        return keys.some((key) => key.startsWith('__reactFiber'));
      }
    },
    null,
    { timeout: 3000 },
  );
}
