import { createRequire } from 'node:module';
import process from 'node:process';
import { parseArgs } from 'node:util';
import loadEnv from './lib/utils/env.js';

loadEnv();

const require = createRequire(new URL('.', import.meta.url));

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
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

async function run() {
  if (values.version) {
    const { version } = require('../package.json');
    console.log(version);
  } else if (values.help) {
    displayUsage();
  } else if (cmd === 'dev' || cmd === 'build' || cmd === 'start') {
    const { runCommand } = await import('./lib/vite-rsc/command.js');
    await runCommand(cmd, values);
  } else {
    if (cmd) {
      console.error('Unknown command:', cmd);
    }
    displayUsage();
  }
}

function displayUsage() {
  console.log(`
Usage: waku [options] <command>

Commands:
  dev         Start the development server
  build       Build the application for production
  start       Start the production server

Options:
  -h, --host            Hostname to bind (e.g. 0.0.0.0)
  -p, --port            Port number for the server
  -v, --version         Display the version number
      --help            Display this help message
`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
