import { DEV_BUILD_ID } from '../constants.js';
import { createInitialRscEntryCode } from './initial-rsc.js';

function getRecoveryBuildId(): string | undefined {
  const buildId = import.meta.env?.WAKU_BUILD_ID;
  if (!buildId || buildId === DEV_BUILD_ID) {
    return undefined;
  }
  return buildId;
}

const MAX_RECOVERY_RELOADS = 3;

// Must run before the bootstrap `import()`. https://github.com/wakujs/waku/issues/2238
function getVersionSkewRecoveryCode(): string {
  const buildId = getRecoveryBuildId();
  if (!buildId) {
    return '';
  }
  return `
    window.addEventListener('vite:preloadError', function (e) {
      var key = 'waku:preload-error-attempts:' + ${JSON.stringify(buildId)};
      var attempts = 0;
      try {
        attempts = Number(sessionStorage.getItem(key)) || 0;
      } catch {}
      if (attempts >= ${MAX_RECOVERY_RELOADS}) {
        return;
      }
      try {
        sessionStorage.setItem(key, String(attempts + 1));
      } catch {}
      e.preventDefault();
      window.location.reload();
    });
  `;
}

// The plugin-rsc bootstrap is a bare `import("...")` whose failure dispatches no `vite:preloadError`.
// TODO: remove once @vitejs/plugin-rsc handles this natively. https://github.com/wakujs/waku/issues/2238
const BOOTSTRAP_IMPORT_RE = /^(import\("(?:[^"\\]|\\.)*"\));?$/;

export function wrapBootstrapScriptContent(content: string): string {
  if (!getRecoveryBuildId()) {
    return content;
  }
  const match = BOOTSTRAP_IMPORT_RE.exec(content.trim());
  if (!match) {
    return content;
  }
  return `${match[1]}.catch((err) => {
    var e = new Event('vite:preloadError', { cancelable: true });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  });`;
}

export function getBootstrapPreamble(options: {
  hydrate: boolean;
  initialRsc: boolean;
  debugId?: string | undefined;
}) {
  return `
    ${getVersionSkewRecoveryCode()}
    ${options.hydrate ? 'globalThis.__WAKU_HYDRATE__ = true;' : ''}
    ${
      options.initialRsc
        ? `
    globalThis.__WAKU_INITIAL_RSC__ = ${createInitialRscEntryCode(
      options.debugId,
    )};
    `
        : ''
    }
  `
    .split('\n')
    .map((line) => line.trim())
    .join('');
}
