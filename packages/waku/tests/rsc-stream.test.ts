import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

const packageRootDir = fileURLToPath(new URL('..', import.meta.url));
const helperSourcePath = fileURLToPath(
  new URL('../src/lib/utils/rsc-stream.ts', import.meta.url),
);
const scenarioSourcePath = fileURLToPath(
  new URL('./fixtures/rsc-stream-scenarios.ts', import.meta.url),
);
const helperOutputPath = fileURLToPath(
  new URL('../../../tmp/rsc-stream.test-helper.mjs', import.meta.url),
);
const helperOutputUrl = pathToFileURL(helperOutputPath).href;
let scenarioRunnerScript = '';

type ScenarioResult = {
  payloadStatusAfterResolve: string | null;
  payloadStatusBeforeResolve: string | null;
  rootSettledBeforeResolve: boolean;
  rootWaitSettledBeforeResolve: boolean;
};

type BridgeScenarioResult = {
  bridgeChunkFound: boolean;
  bridgePendingCountBeforeResolve: number;
  bridgeWaitSettledBeforeResolve: boolean;
};

const runNodeScenario = async <T>(script: string): Promise<T> => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      '--conditions',
      'react-server',
      '--input-type=module',
      '-e',
      scenarioRunnerScript,
    ],
    {
      cwd: packageRootDir,
      env: {
        ...process.env,
        WAKU_RSC_STREAM_HELPER_URL: helperOutputUrl,
        WAKU_RSC_STREAM_SCENARIO: script,
      },
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    },
  );
  return JSON.parse(stdout.trim()) as T;
};

const runSettledRootScenario = async (): Promise<ScenarioResult> => {
  return runNodeScenario<ScenarioResult>('settled-root');
};

const runBridgeChunkScenario = async (): Promise<BridgeScenarioResult> => {
  return runNodeScenario<BridgeScenarioResult>('bridge-chunk');
};

beforeAll(async () => {
  await mkdir(dirname(helperOutputPath), { recursive: true });
  const transpileTsFile = async (sourcePath: string) => {
    const source = await readFile(sourcePath, 'utf8');
    return ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });
  };

  const helperOutput = await transpileTsFile(helperSourcePath);
  await writeFile(helperOutputPath, helperOutput.outputText);

  const scenarioOutput = await transpileTsFile(scenarioSourcePath);
  scenarioRunnerScript = scenarioOutput.outputText;
});

afterAll(async () => {
  await rm(helperOutputPath, { force: true });
});

describe('waitForRootPrerequisites', () => {
  test('waits even after the root promise settles if Flight chunks are pending', async () => {
    const result = await runSettledRootScenario();
    expect(result.rootSettledBeforeResolve).toBe(true);
    expect(result.payloadStatusBeforeResolve).toBe('pending');
    expect(result.rootWaitSettledBeforeResolve).toBe(false);
    expect(result.payloadStatusAfterResolve).toBe('fulfilled');
  });

  test('follows pending chunks through chunk.reason._chunks from real Flight output', async () => {
    const result = await runBridgeChunkScenario();
    expect(result.bridgeChunkFound).toBe(true);
    expect(result.bridgePendingCountBeforeResolve).toBeGreaterThan(0);
    expect(result.bridgeWaitSettledBeforeResolve).toBe(false);
  });
});
