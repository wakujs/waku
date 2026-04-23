import { createRequire } from 'node:module';
import process from 'node:process';
import { parseArgs } from 'node:util';

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
  } else if (cmd === 'dev') {
    const { runDev } = await import('./lib/vite-rsc/cmd-dev.js');
    await runDev(values);
  } else if (cmd === 'build') {
    const { runBuild } = await import('./lib/vite-rsc/cmd-build.js');
    await runBuild();
    process.exit(0);
  } else if (cmd === 'start') {
    const { runStart } = await import('./lib/vite-rsc/cmd-start.js');
    await runStart(values);
  } else if (cmd === 'router') {
    const { runRouter } = await import('./lib/vite-rsc/cmd-router.js');
    await runRouter(positionals[1]);
    process.exit(0);
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
  dev              Start the development server
  build            Build the application for production
  start            Start the production server
  router typegen   Generate pages.gen.ts from src/pages

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
