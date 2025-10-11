import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import process from 'node:process';
import * as dotenv from 'dotenv';

const require = createRequire(new URL('.', import.meta.url));

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    'with-vercel': {
      type: 'boolean',
    },
    'with-vercel-static': {
      type: 'boolean',
    },
    'with-netlify': {
      type: 'boolean',
    },
    'with-netlify-static': {
      type: 'boolean',
    },
    'with-cloudflare': {
      type: 'boolean',
    },
    'with-deno': {
      type: 'boolean',
    },
    'with-aws-lambda': {
      type: 'boolean',
    },
    'experimental-partial': {
      type: 'boolean',
    },
    host: {
      type: 'string',
      short: 'h',
    },
    port: {
      type: 'string',
      short: 'p',
    },
    version: {
      type: 'boolean',
      short: 'v',
    },
    help: {
      type: 'boolean',
    },
  },
});

const cmd = positionals[0];

if (values.version) {
  const { version } = require('../package.json');
  console.log(version);
} else if (values.help) {
  displayUsage();
} else if (cmd === 'dev' || cmd === 'build' || cmd === 'start') {
  const { cli } = await import('./lib/vite-rsc/cli.js');
  await cli(cmd, values);
} else {
  if (cmd) {
    console.error('Unknown command:', cmd);
  }
  displayUsage();
}

function displayUsage() {
  console.log(`
Usage: waku [options] <command>

Commands:
  dev         Start the development server
  build       Build the application for production
  start       Start the production server

Options:
  --with-vercel         Output for Vercel on build
  --with-netlify        Output for Netlify on build
  --with-cloudflare     Output for Cloudflare on build
  --with-deno           Output for Deno on build
  --with-aws-lambda     Output for AWS Lambda on build
  -h, --host            Hostname to bind (e.g. 0.0.0.0)
  -p, --port            Port number for the server
  -v, --version         Display the version number
      --help            Display this help message
`);
}
