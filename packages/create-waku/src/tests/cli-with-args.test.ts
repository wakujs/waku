import fs from 'node:fs';
import path from 'node:path';
import type { SyncOptions, SyncResult } from 'execa';
import { execaCommandSync, execa } from 'execa';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  onTestFailed,
  test,
} from 'vitest';

const CLI_PATH = path.join(import.meta.dirname, '../../dist/index.js');

const projectName = 'test-waku-app';
const genPath = path.join(import.meta.dirname, projectName);
const genPathWithSubfolder = path.join(
  import.meta.dirname,
  '.test',
  projectName,
);

const run = <SO extends SyncOptions>(
  args: string[],
  options?: SO,
): SyncResult<SO> => {
  const command = `node ${CLI_PATH} ${args.join(' ')}`;
  const result = execaCommandSync(command, options);
  onTestFailed(() => {
    console.error('======= command');
    console.error(command);
    console.error('======= stdout');
    console.error(result.stdout);
    console.error('======= stderr');
    console.error(result.stderr);
    console.error('=======');
  });
  // @ts-expect-error relies on exactOptionalPropertyTypes being false
  return result;
};

// Helper to create a non-empty directory
const createNonEmptyDir = (overrideFolder?: string) => {
  // Create the temporary directory
  const newNonEmptyFolder = overrideFolder || genPath;
  fs.mkdirSync(newNonEmptyFolder, { recursive: true });

  // Create a package.json file
  const pkgJson = path.join(newNonEmptyFolder, 'package.json');
  fs.writeFileSync(pkgJson, '{ "foo": "bar" }');
};

const clearAnyPreviousFolders = () => {
  if (fs.existsSync(genPath)) {
    fs.rmSync(genPath, { recursive: true, force: true });
  }
  if (fs.existsSync(genPathWithSubfolder)) {
    fs.rmSync(genPathWithSubfolder, { recursive: true, force: true });
  }
};

describe('create-waku CLI with args', () => {
  beforeAll(() => clearAnyPreviousFolders());
  afterEach(() => clearAnyPreviousFolders());

  test('prompts for the project name if none supplied', () => {
    const { stdout } = run([]);
    expect(stdout).toContain('Project Name');
  });

  test('should not prompt for the project name if supplied', () => {
    const { stdout } = run(['--project-name', projectName], {
      cwd: __dirname,
      timeout: 30000,
      reject: false,
    });
    expect(stdout).not.toContain('Project Name');
  }, 15000);

  test('prompts for the template selection', () => {
    const { stdout } = run(['--project-name', projectName, '--choose']);
    expect(stdout).toContain('Choose a starter template');
  });

  test('choosing an option chooses that option', async () => {
    const cmd = execa({
      cwd: import.meta.dirname, timeout: 2000, reject: false
    })`node ${CLI_PATH} --project-name ${projectName} --choose --skip-install`
    cmd.stdin.write("k\r\n")
    await cmd
    const packageJsonPath = path.join(genPath, "package.json")
    expect(fs.existsSync(packageJsonPath)).toBe(true)
    const packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath).toString())
    const dependencies = Object.keys(packageJsonContent.dependencies || {})
    expect(dependencies).toContain("jotai")
    expect(dependencies).toContain("waku-jotai")
  }, 15000)

  test('asks to overwrite non-empty target directory', () => {
    createNonEmptyDir();
    const { stdout } = run(['--project-name', projectName], {
      cwd: import.meta.dirname,
    });
    expect(stdout).toContain(
      `${projectName} is not empty. Remove existing files and continue?`,
    );
  });

  test('asks to overwrite non-empty target directory with subfolder', () => {
    createNonEmptyDir(genPathWithSubfolder);
    const { stdout } = run(['--project-name', `.test/${projectName}`], {
      cwd: import.meta.dirname,
    });
    expect(stdout).toContain(
      `.test/${projectName} is not empty. Remove existing files and continue?`,
    );
  });

  test('displays help message with --help flag', () => {
    const { stdout } = run(['--help'], { cwd: import.meta.dirname });
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Options:');
    expect(stdout).toContain('--choose');
    expect(stdout).toContain('--template');
    expect(stdout).toContain('--example');
    expect(stdout).toContain('--project-name');
  });

  test('displays help message with -h alias', () => {
    const { stdout } = run(['-h'], { cwd: import.meta.dirname });
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Options:');
  });

  test('accepts template option from command line', () => {
    const { stdout } = run(
      ['--project-name', projectName, '--template', '01_template'],
      { cwd: import.meta.dirname },
    );
    expect(stdout).toContain('Setting up project...');
  }, 10000);

  test(
    'accepts example option from command line',
    { timeout: 30000, retry: process.env.CI ? 3 : 0 },
    () => {
      const { stdout } = run(
        [
          '--project-name',
          projectName,
          '--example',
          'https://github.com/wakujs/waku/tree/main/examples/01_template',
        ],
        { cwd: import.meta.dirname, timeout: 30000, reject: false },
      );
      expect(stdout).toContain('Setting up project...');
    },
  );

  test('shows installation instructions after setup', () => {
    const { stdout } = run(
      ['--project-name', projectName, '--template', '01_template'],
      { cwd: import.meta.dirname, timeout: 30000, reject: false },
    );

    expect(stdout).toContain('Installing dependencies by running');
  }, 10000);

  test('handles choose flag to explicitly prompt for template', () => {
    const { stdout } = run(['--project-name', projectName, '--choose'], {
      cwd: import.meta.dirname,
    });
    expect(stdout).toContain('Choose a starter template');
  });

  test('starts installation process after template selection', () => {
    const { stdout } = run(
      ['--project-name', projectName, '--template', '01_template'],
      { cwd: import.meta.dirname, timeout: 30000, reject: false },
    );
    expect(stdout).toContain('Setting up project...');
    expect(stdout).toContain('Installing dependencies by running');
  }, 10000);

  test('shows completion message with instructions', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--template',
        '01_template',
        '--skip-install',
      ],
      { cwd: import.meta.dirname, reject: false },
    );

    // Check for either successful installation or manual instructions
    const hasCompletionMessage =
      stdout.includes('Now run:') ||
      stdout.includes('Could not execute') ||
      stdout.includes('Done. Now run:');

    expect(hasCompletionMessage).toBe(true);
  });
});
