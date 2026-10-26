import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { URL } from 'node:url';

for (const mode of ['development', 'production']) {
  for (const [file, flags] of [
    ['probe.mjs', ['--conditions=react-server', '--experimental-strip-types']],
    ['ssr-probe.mjs', []],
  ]) {
    execFileSync(process.execPath, [...flags, file], {
      cwd: new URL('.', import.meta.url),
      env: { ...process.env, NODE_ENV: mode },
      stdio: 'inherit',
    });
  }
}
