import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SRC_PAGES } from '../constants.js';
import {
  detectFsRouterUsage,
  generateFsRouterTypes,
} from '../vite-plugins/fs-router-typegen.js';
import { loadConfig, loadDotEnv } from './loader.js';

loadDotEnv();

export async function runRouter(subCommand: string | undefined) {
  if (subCommand === 'typegen') {
    await runTypegen();
  } else {
    if (subCommand) {
      console.error('Unknown router subcommand:', subCommand);
    }
    console.log(`
Usage: waku router <subcommand>

Subcommands:
  typegen     Generate pages.gen.ts from src/pages
`);
  }
}

async function runTypegen() {
  const config = await loadConfig();
  const srcDir = join(process.cwd(), config.srcDir);
  const pagesDir = join(srcDir, SRC_PAGES);

  if (!existsSync(pagesDir)) {
    console.error(`Pages directory not found: ${pagesDir}`);
    process.exit(1);
  }

  if (!(await detectFsRouterUsage(srcDir))) {
    console.error('fsRouter usage not detected in waku.server.ts');
    process.exit(1);
  }

  const result = await generateFsRouterTypes(pagesDir);
  if (!result) {
    console.error('Failed to generate types (no page files found)');
    process.exit(1);
  }

  const outputFile = join(srcDir, 'pages.gen.ts');
  await writeFile(outputFile, result, 'utf-8');
  console.log(`Generated ${outputFile}`);
}
