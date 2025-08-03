import { type Plugin, type ResolvedConfig } from 'vite';
import type { Config } from '../../../config.js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SERVER_ENTRY = path.join(__dirname, 'entry.js');
const SERVE_JS = 'serve-deno.js';

export function deployDenoPlugin(deployOptions: {
  config: Required<Config>;
}): Plugin {
  return {
    name: 'waku:deploy-deno',
    config() {
      return {
        environments: {
          rsc: {
            build: {
              rollupOptions: {
                input: {
                  deno: SERVER_ENTRY,
                },
                external: [/^jsr:/],
              },
            },
          },
        },
      };
    },
    buildApp: {
      order: 'post',
      async handler(builder) {
        await build({
          config: builder.config,
          opts: deployOptions.config,
        });
      },
    },
  };
}

async function build({
  opts,
}: {
  config: ResolvedConfig;
  opts: Required<Config>;
}) {
  writeFileSync(path.join(opts.distDir, SERVE_JS), `import './rsc/deno.js';\n`);
}
