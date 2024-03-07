import net from 'node:net';
import { expect, test as basicTest } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { error, info } from '@actions/core';
import { createRequire } from 'node:module';

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

export async function getFreePort(): Promise<number> {
  return new Promise<number>((res) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => res(port));
    });
  });
}

export function debugChildProcess(cp: ChildProcess, sourceFile: string) {
  cp.stdout?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    info(`stdout: ${str}`);
    console.log(`stdout: ${str}`);
  });

  cp.stderr?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    error(`stderr: ${str}`, {
      title: 'Child Process Error',
      file: sourceFile,
    });
    console.error(`stderr: ${str}`);
  });
}

export const test = basicTest.extend({
  page: async ({ page }, use) => {
    const callback = (msg: ConsoleMessage) => {
      if (unexpectedErrors.some((re) => re.test(msg.text()))) {
        console.log('error', msg.text());
        throw new Error(msg.text());
      }
      console.log(`${msg.type()}: ${msg.text()}`);
    };
    page.on('request', (req) => console.log(req.url()))
    page.on('console', callback);
    await use(page);
    page.off('console', callback);
  },
});
