import { INTERNAL_setAllEnv } from '../../server.js';
import { waitForTasks } from '../utils/task-runner.js';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export async function runBuild() {
  INTERNAL_setAllEnv(process.env as any);
  await serverEntry.build();
  await waitForTasks();
}
