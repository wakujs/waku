import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as dotenv from 'dotenv';

import type { Config } from './config.js';
import { serverEngine } from './lib/hono/engine.js';
import { build } from './lib/builder/build.js';
import { DIST_ENTRIES_JS, DIST_PUBLIC } from './lib/builder/constants.js';

const require = createRequire(new URL('.', import.meta.url));

dotenv.config({ path: ['.env.local', '.env'] });

const CONFIG_FILE = 'waku.config.ts'; // XXX only ts extension

// ASCII Art for Waku server
const ASCII_ART = `
⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️
⛩️                                     ⛩️
⛩️    W A K U                          ⛩️
⛩️    The Minimal React Framework      ⛩️
⛩️                                     ⛩️
⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️⛩️
`;

// Logger for consistent log formatting
const logger = {
  info: (message: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${message}`),
  success: (message: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`),
  warn: (message: string) => console.log(`\x1b[33m[WARNING]\x1b[0m ${message}`),
  error: (message: string) => console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`),
  fileChange: (filePath: string, action: string) => console.log(`\x1b[35m[FILE]\x1b[0m ${action}: ${filePath}`),
};

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
    'with-partykit': {
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
    'experimental-compress': {
      type: 'boolean',
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
      short: 'h',
    },
  },
});

const cmd = positionals[0];

if (values.version) {
  const { version } = require('../package.json');
  logger.info(`Waku version: ${version}`);
} else if (values.help) {
  displayUsage();
} else {
  switch (cmd) {
    case 'dev':
      logger.info(`Starting Waku in development mode...`);
      await runDev();
      break;
    case 'build':
      logger.info(`Building Waku for production...`);
      await runBuild();
      break;
    case 'start':
      logger.info(`Starting Waku in production mode...`);
      await runStart();
      break;
    default:
      if (cmd) {
        logger.error(`Unknown command: ${cmd}`);
      }
      displayUsage();
      break;
  }
}

async function runDev() {
  logger.info(`Loading configuration...`);
  const config = await loadConfig();
  logger.info(`Configuration loaded successfully`);
  
  const honoEnhancer =
    config.unstable_honoEnhancer || ((createApp) => createApp);
  const createApp = (app: Hono) => {
    if (values['experimental-compress']) {
      logger.info(`Enabling compression middleware`);
      app.use(compress());
    }
    
    // Middleware to log all requests
    app.use('*', async (c, next) => {
      const start = Date.now();
      const method = c.req.method;
      const path = c.req.path;
      
      logger.info(`${method} ${path}`);
      
      await next();
      
      const duration = Date.now() - start;
      const status = c.res.status;
      const statusColor = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
      
      logger.info(`${method} ${path} - ${statusColor}${status}\x1b[0m (${duration}ms)`);
      return;
    });
    
    logger.info(`Setting up server engine...`);
    app.use(
      serverEngine({
        cmd: 'dev',
        config,
        env: process.env as any,
        unstable_onError: new Set([
          ((err: unknown) => {
            if (err instanceof Error) {
              logger.error(`Server Error: ${err.message}`);
              logger.error(err.stack || 'No stack trace available');
            } else {
              logger.error(`Server Error: ${String(err)}`);
            }
            return false;
          }) as any
        ]),
      }),
    );
    
    app.notFound((c) => {
      // FIXME can we avoid hardcoding the public path?
      const file = path.join('public', '404.html');
      logger.warn(`Not found: ${c.req.path} - checking for ${file}`);
      if (existsSync(file)) {
        logger.info(`Serving custom 404 page from ${file}`);
        return c.html(readFileSync(file, 'utf8'), 404);
      }
      logger.warn(`No custom 404 page found, returning default response`);
      return c.text('404 Not Found', 404);
    });
    
    app.onError((err, c) => {
      logger.error(`Application error: ${err.message}`);
      logger.error(err.stack || 'No stack trace available');
      return c.text(`Server Error: ${err.message}`, 500);
    });
    
    return app;
  };
  
  const port = parseInt(values.port || '3000', 10);
  logger.info(`Starting development server on port ${port}...`);
  await startServer(honoEnhancer(createApp)(new Hono()), port);
}

async function runBuild() {
  logger.info(`Loading configuration...`);
  const config = await loadConfig();
  logger.info(`Configuration loaded successfully`);
  
  process.env.NODE_ENV = 'production';
  logger.info(`Environment set to ${process.env.NODE_ENV}`);
  
  // Track start time for build process
  const startTime = Date.now();
  
  // Determine build target based on flags
  const deployTarget =
    ((values['with-vercel'] ?? !!process.env.VERCEL)
      ? values['with-vercel-static']
        ? 'vercel-static'
        : 'vercel-serverless'
      : undefined) ||
    ((values['with-netlify'] ?? !!process.env.NETLIFY)
      ? values['with-netlify-static']
        ? 'netlify-static'
        : 'netlify-functions'
      : undefined) ||
    (values['with-cloudflare'] ? 'cloudflare' : undefined) ||
    (values['with-partykit'] ? 'partykit' : undefined) ||
    (values['with-deno'] ? 'deno' : undefined) ||
    (values['with-aws-lambda'] ? 'aws-lambda' : undefined);
  
  if (deployTarget) {
    logger.info(`Build target: ${deployTarget}`);
  }
  
  if (values['experimental-partial']) {
    logger.info(`Using experimental partial build`);
  }
  
  // Create a proxy for the unstable_getBuildOptions function to track phase changes
  let currentPhase = '';
  const { unstable_getBuildOptions } = await import('./server.js');
  const originalGetBuildOptions = unstable_getBuildOptions;
  
  // Override the global function to monitor build phases
  (await import('./server.js')).unstable_getBuildOptions = () => {
    const options = originalGetBuildOptions();
    // Check if phase has changed
    if (options.unstable_phase && options.unstable_phase !== currentPhase) {
      // Log the phase transition
      if (currentPhase) {
        logger.success(`Completed build phase: ${currentPhase}`);
      }
      currentPhase = options.unstable_phase;
      logger.info(`Starting build phase: ${currentPhase}`);
    }
    return options;
  };
  
  try {
    logger.info(`Starting build process...`);
    await build({
      config,
      env: process.env as any,
      partial: !!values['experimental-partial'],
      deploy: deployTarget,
    });
    
    const buildTime = Date.now() - startTime;
    logger.success(`Build completed successfully in ${buildTime}ms`);
  } catch (error) {
    let errorMessage = 'Unknown error';
    let errorStack = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack || '';
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    logger.error(`Build failed: ${errorMessage}`);
    if (errorStack) {
      logger.error(errorStack);
    }
    
    process.exit(1);
  } finally {
    // Restore the original function
    (await import('./server.js')).unstable_getBuildOptions = originalGetBuildOptions;
  }
}

async function runStart() {
  logger.info(`Loading configuration...`);
  const config = await loadConfig();
  logger.info(`Configuration loaded successfully`);
  const { distDir = 'dist' } = config;
  const honoEnhancer =
    config.unstable_honoEnhancer || ((createApp) => createApp);
  const loadEntries = () =>
    import(pathToFileURL(path.resolve(distDir, DIST_ENTRIES_JS)).toString());
  const createApp = (app: Hono) => {
    if (values['experimental-compress']) {
      logger.info(`Enabling compression middleware`);
      app.use(compress());
    }
    
    // Middleware to log all requests
    app.use('*', async (c, next) => {
      const start = Date.now();
      const method = c.req.method;
      const path = c.req.path;
      
      logger.info(`${method} ${path}`);
      
      await next();
      
      const duration = Date.now() - start;
      const status = c.res.status;
      const statusColor = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
      
      logger.info(`${method} ${path} - ${statusColor}${status}\x1b[0m (${duration}ms)`);
      return;
    });
    
    logger.info(`Setting up static file serving from ${path.join(distDir, DIST_PUBLIC)}`);
    app.use(serveStatic({ root: path.join(distDir, DIST_PUBLIC) }));
    
    logger.info(`Setting up server engine...`);
    app.use(
      serverEngine({
        cmd: 'start',
        loadEntries,
        env: process.env as any,
        unstable_onError: new Set([
          // Cast the error handler to the expected ErrorCallback type
          ((err: unknown) => {
            if (err instanceof Error) {
              logger.error(`Server Error: ${err.message}`);
              logger.error(err.stack || 'No stack trace available');
            } else {
              logger.error(`Server Error: ${String(err)}`);
            }
            return false; // Continue with other error handlers
          }) as any
        ]),
      }),
    );
    
    app.notFound((c) => {
      // FIXME better implementation using node stream?
      const file = path.join(distDir, DIST_PUBLIC, '404.html');
      logger.warn(`Not found: ${c.req.path} - checking for ${file}`);
      if (existsSync(file)) {
        logger.info(`Serving custom 404 page from ${file}`);
        return c.html(readFileSync(file, 'utf8'), 404);
      }
      logger.warn(`No custom 404 page found, returning default response`);
      return c.text('404 Not Found', 404);
    });
    
    app.onError((err, c) => {
      logger.error(`Application error: ${err.message}`);
      logger.error(err.stack || 'No stack trace available');
      return c.text(`Server Error: ${err.message}`, 500);
    });
    
    return app;
  };
  
  const port = parseInt(values.port || '8080', 10);
  logger.info(`Starting production server on port ${port}...`);
  await startServer(honoEnhancer(createApp)(new Hono()), port);
}

function startServer(app: Hono, port: number) {
  return new Promise<void>((resolve, reject) => {
    console.log(ASCII_ART);
    
    const startTime = new Date();
    const formattedTime = startTime.toLocaleTimeString();
    
    logger.info(`Starting server at ${formattedTime}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Node version: ${process.version}`);
    
    const server = serve({ ...app, port }, () => {
      const bootTime = Date.now() - startTime.getTime();
      logger.success(`Server ready in ${bootTime}ms!`);
      logger.success(`Listening on http://localhost:${port}/`);
      logger.info(`Press Ctrl+C to stop the server`);
      resolve();
    });
    
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${port} is in use, trying ${port + 1} instead.`);
        startServer(app, port + 1)
          .then(resolve)
          .catch(reject);
      } else {
        logger.error(`Failed to start server: ${err.message}`);
        logger.error(err.stack || 'No stack trace available');
        reject(err);
      }
    });
    
    // Set up process event listeners for graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT signal, shutting down server...');
      server.close(() => {
        logger.success('Server shut down successfully');
        process.exit(0);
      });
    });
    
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal, shutting down server...');
      server.close(() => {
        logger.success('Server shut down successfully');
        process.exit(0);
      });
    });
    
    process.on('uncaughtException', (err) => {
      logger.error(`Uncaught exception: ${err.message}`);
      logger.error(err.stack || 'No stack trace available');
      
      // In development, we might want to keep the server running
      if (process.env.NODE_ENV === 'production') {
        logger.error('Shutting down due to uncaught exception in production');
        server.close(() => process.exit(1));
      }
    });
  });
}

function displayUsage() {
  console.log(ASCII_ART);
  
  const usageText = `
Usage: waku [options] <command>

Commands:
  dev         Start the development server
  build       Build the application for production
  start       Start the production server

Options:
  --with-vercel         Output for Vercel on build
  --with-netlify        Output for Netlify on build
  --with-cloudflare     Output for Cloudflare on build
  --with-partykit       Output for PartyKit on build
  --with-deno           Output for Deno on build
  --with-aws-lambda     Output for AWS Lambda on build
  -p, --port            Port number for the server
  -v, --version         Display the version number
  -h, --help            Display this help message
`;

  console.log(usageText);
  logger.info('For more information, visit https://waku.gg');
}

async function loadConfig(): Promise<Config> {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  const { loadServerModule } = await import('./lib/utils/vite-loader.js');
  const file = pathToFileURL(path.resolve(CONFIG_FILE)).toString();
  return (await loadServerModule<{ default: Config }>(file)).default;
}
