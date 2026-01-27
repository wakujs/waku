import { createRequire } from 'node:module';
import process from 'node:process';
import { parseArgs } from 'node:util';
import * as dotenv from 'dotenv';

const require = createRequire(new URL('.', import.meta.url));

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

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
    'experimental-vite-config': {
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
    if (values['experimental-vite-config']) {
      await runViteCommand(cmd, values);
    } else {
      const { runCommand } = await import('./lib/vite-rsc/command.js');
      await runCommand(cmd, values);
    }
  } else {
    if (cmd) {
      console.error('Unknown command:', cmd);
    }
    displayUsage();
  }
}

async function runViteCommand(
  cmd: 'dev' | 'build' | 'start',
  flags: { host?: string; port?: string },
) {
  const vite = await import('vite');

  const nodeEnv = cmd === 'dev' ? 'development' : 'production';
  if (process.env.NODE_ENV && process.env.NODE_ENV !== nodeEnv) {
    console.warn(
      `Warning: NODE_ENV is set to '${process.env.NODE_ENV}', but overriding it to '${nodeEnv}'.`,
    );
  }
  process.env.NODE_ENV = nodeEnv;

  if (cmd === 'dev') {
    const host = flags.host;
    const port = parseInt(flags.port || '3000', 10);
    const server = await vite.createServer({
      server: host ? { host, port } : { port },
    });
    await server.listen();
    const url =
      server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0];
    console.log(`ready: Listening on ${url}`);
  } else if (cmd === 'build') {
    const builder = await vite.createBuilder();
    await builder.buildApp();
  } else if (cmd === 'start') {
    const host = flags.host;
    const port = parseInt(flags.port || '8080', 10);
    const { pathToFileURL } = await import('node:url');
    const { resolve } = await import('node:path');
    const distDir = 'dist';
    const serveFileUrl = pathToFileURL(resolve(distDir, 'serve-node.js')).href;
    if (host) {
      process.env.HOST = host;
    }
    process.env.PORT = String(port);
    await import(serveFileUrl);
    console.log(`ready: Listening on http://${host || 'localhost'}:${port}/`);
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
  -h, --host                     Hostname to bind (e.g. 0.0.0.0)
  -p, --port                     Port number for the server
  -v, --version                  Display the version number
      --help                     Display this help message
      --experimental-vite-config Use vite.config.ts instead of waku.config.ts
`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
