import { type Plugin, type ResolvedConfig } from 'vite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '../../../../config.js';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SERVER_ENTRY = path.join(__dirname, 'entry.js');
const SERVE_JS = 'serve-aws-lambda.js';

export function deployAwsLambdaPlugin(deployOptions: {
  config: Required<Config>;
  streaming: boolean;
}): Plugin {
  return {
    name: 'waku:deploy-aws-lambda',
    config() {
      return {
        environments: {
          rsc: {
            build: {
              rollupOptions: {
                input: {
                  index: SERVER_ENTRY,
                },
              },
            },
            define: {
              'import.meta.env.WAKU_AWS_LAMBDA_STREAMING': JSON.stringify(
                deployOptions.streaming,
              ),
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
  writeFileSync(
    path.join(opts.distDir, SERVE_JS),
    `export { handler } from './rsc/index.js';\n`,
  );
  writeFileSync(
    path.join(opts.distDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );
}
