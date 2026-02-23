import fs from 'node:fs';
import path from 'node:path';

export type BuildOptions = {
  srcDir: string;
  distDir: string;
  DIST_PUBLIC: string;
  serverless: boolean;
};

const DEFAULT_COMPATIBILITY_DATE = '2025-11-17';
const DEFAULT_COMPATIBILITY_FLAGS = ['nodejs_als'];

function readRootWranglerConfig(): Record<string, unknown> | null {
  for (const file of ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']) {
    try {
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const config: Record<string, unknown> = {};
      const nameMatch = content.match(/"?name"?\s*[:=]\s*"([^"]+)"/);
      if (nameMatch) {
        config.name = nameMatch[1];
      }
      const dateMatch = content.match(
        /"?compatibility_date"?\s*[:=]\s*"([^"]+)"/,
      );
      if (dateMatch) {
        config.compatibility_date = dateMatch[1];
      }
      const flagsMatch = content.match(
        /"?compatibility_flags"?\s*[:=]\s*\[([^\]]*)\]/,
      );
      if (flagsMatch) {
        const flags = [...flagsMatch[1]!.matchAll(/"([^"]+)"/g)].map(
          (m) => m[1] as string,
        );
        if (flags.length > 0) {
          config.compatibility_flags = flags;
        }
      }
      return config;
    } catch {
      // Skip if can't be read
    }
  }
  return null;
}

function getProjectName(rootConfig: Record<string, unknown> | null): string {
  if (typeof rootConfig?.name === 'string') {
    return rootConfig.name;
  }
  try {
    const packageJsonPath = path.resolve('package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    if (typeof packageJson.name === 'string') {
      return packageJson.name;
    }
  } catch {
    // Fall back to default
  }
  return 'waku-project';
}

function getWranglerConfig(
  serverless: boolean,
  main?: string,
  assets?: { directory: string; html_handling: string },
): string {
  const rootConfig = readRootWranglerConfig();
  const config: Record<string, unknown> = {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: getProjectName(rootConfig),
    ...(main && { main }),
    ...(serverless && {
      compatibility_flags:
        (rootConfig?.compatibility_flags as string[]) ||
        DEFAULT_COMPATIBILITY_FLAGS,
    }),
    compatibility_date:
      (rootConfig?.compatibility_date as string) || DEFAULT_COMPATIBILITY_DATE,
    ...(assets && {
      assets: {
        ...(serverless && { binding: 'ASSETS' }),
        directory: assets.directory,
        html_handling: assets.html_handling,
      },
    }),
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    no_bundle: true,
  };
  return JSON.stringify(config, null, 2) + '\n';
}

async function preBuild({
  srcDir,
  distDir,
  DIST_PUBLIC,
  serverless,
}: BuildOptions) {
  const mainEntry = path.resolve(path.join(srcDir, 'waku.server'));
  const wranglerTomlFile = path.resolve('wrangler.toml');
  const wranglerJsonFile = path.resolve('wrangler.json');
  const wranglerJsoncFile = path.resolve('wrangler.jsonc');
  if (
    !fs.existsSync(wranglerTomlFile) &&
    !fs.existsSync(wranglerJsonFile) &&
    !fs.existsSync(wranglerJsoncFile)
  ) {
    fs.writeFileSync(
      wranglerJsoncFile,
      getWranglerConfig(
        serverless,
        serverless
          ? forceRelativePath(path.relative(process.cwd(), mainEntry))
          : undefined,
        {
          directory: `./${distDir}/${DIST_PUBLIC}`,
          html_handling: 'drop-trailing-slash',
        },
      ),
    );
  }
}

async function postBuild({ distDir, serverless }: BuildOptions) {
  if (!serverless) {
    return;
  }
  const distServerDir = path.resolve(path.join(distDir, 'server'));
  const distServerWranglerJson = path.join(distServerDir, 'wrangler.json');
  if (!fs.existsSync(distServerWranglerJson)) {
    fs.mkdirSync(distServerDir, { recursive: true });
    // Fallback for the case without @cloudflare/vite-plugin.
    fs.writeFileSync(
      distServerWranglerJson,
      getWranglerConfig(true, 'index.js'),
    );
  }
}

export default async function buildEnhancer(
  build: (utils: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (utils: unknown, options: BuildOptions) => {
    await preBuild(options);
    await build(utils, options);
    await postBuild(options);
  };
}

const forceRelativePath = (s: string) => (s.startsWith('.') ? s : './' + s);
