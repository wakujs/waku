import type { Plugin } from 'vite';
import { base64ToBytes, bytesToBase64 } from '../utils-build/base64-node.js';
import {
  DEBUG_CMD_EVENT,
  DEBUG_DATA_EVENT,
  DEBUG_ID_HEADER,
  type DebugEventPayload,
  assertIsDebugEventPayload,
} from '../utils-isomorphic/react-debug-channel.js';

type CreateDebugChannel = () => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type FinishDebugChannel = () => void;

export type DebugChannelRegistry = Map<
  string,
  [CreateDebugChannel, FinishDebugChannel]
>;

const getDebugChannelRegistry = () =>
  (globalThis.__WAKU_DEBUG_CHANNEL_REGISTRY__ ||= new Map());

const setRequestHeader = (
  req: {
    headers: Record<string, string | string[] | undefined>;
    rawHeaders?: string[];
  },
  name: string,
  value: string,
) => {
  const lowerName = name.toLowerCase();
  req.headers[lowerName] = value;
  if (!req.rawHeaders) {
    return;
  }
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i]?.toLowerCase() === lowerName) {
      req.rawHeaders[i + 1] = value;
      return;
    }
  }
  req.rawHeaders.push(name, value);
};

const MAX_WAITING_SESSIONS = 100;
export const MAX_WAITING_SESSIONS_FOR_TEST = MAX_WAITING_SESSIONS;
const MAX_REMEMBERED_IDS = 1000;
export const MAX_REMEMBERED_IDS_FOR_TEST = MAX_REMEMBERED_IDS;

const addWithLimit = (ids: Set<string>, id: string, limit: number) => {
  ids.add(id);
  if (ids.size <= limit) {
    return undefined;
  }
  const [oldestId] = ids;
  ids.delete(oldestId!);
  return oldestId;
};

type Session = {
  ready: boolean;
  dropped: boolean;
  streamOpened: boolean;
  pendingChunks: Uint8Array[];
  streamClosed: boolean;
  requestDone: boolean;
  cmdController?: ReadableStreamDefaultController<Uint8Array>;
};

export function rscDevtoolsPlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:rsc-devtools',
    configureServer(server) {
      const hot = server.environments.client.hot;
      const sessions = new Map<string, Session>();
      const waitingIds = new Set<string>();
      const earlyReadyIds = new Set<string>();
      const droppedIds = new Set<string>();

      const dropSession = (debugId: string) => {
        getDebugChannelRegistry().delete(debugId);
        sessions.delete(debugId);
        waitingIds.delete(debugId);
      };

      const sendDone = (debugId: string) => {
        hot.send(DEBUG_DATA_EVENT, {
          i: debugId,
          d: true,
        } satisfies DebugEventPayload);
      };

      const getSession = (debugId: string) => {
        let session = sessions.get(debugId);
        if (!session) {
          session = {
            ready: earlyReadyIds.delete(debugId),
            dropped: false,
            streamOpened: false,
            pendingChunks: [],
            streamClosed: false,
            requestDone: false,
          };
          sessions.set(debugId, session);
          droppedIds.delete(debugId);
          updateWaiting(debugId, session);
        }
        return session;
      };

      const isWaiting = (session: Session) =>
        !session.ready || (session.requestDone && !session.streamOpened);

      const updateWaiting = (debugId: string, session: Session) => {
        if (session.dropped) {
          return;
        }
        if (!isWaiting(session)) {
          waitingIds.delete(debugId);
          return;
        }
        const oldestId = addWithLimit(
          waitingIds,
          debugId,
          MAX_WAITING_SESSIONS,
        );
        if (oldestId) {
          stopSession(oldestId);
        }
      };

      const sendChunk = (debugId: string, chunk: Uint8Array) => {
        hot.send(DEBUG_DATA_EVENT, {
          i: debugId,
          b: bytesToBase64(chunk),
        } satisfies DebugEventPayload);
      };

      const closeCmdController = (session: Session) => {
        const controller = session.cmdController;
        if (!controller) {
          return;
        }
        delete session.cmdController;
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      const enqueueCmdChunk = (session: Session, chunk: Uint8Array) => {
        const controller = session.cmdController;
        if (!controller) {
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          delete session.cmdController;
        }
      };

      const cleanupIfDone = (debugId: string, session: Session) => {
        if (!session.ready || !session.streamClosed || !session.requestDone) {
          return;
        }
        dropSession(debugId);
        sendDone(debugId);
      };

      const stopSession = (debugId: string) => {
        const session = sessions.get(debugId);
        dropSession(debugId);
        if (!session) {
          return;
        }
        session.dropped = true;
        session.pendingChunks.length = 0;
        closeCmdController(session);
        if (session.ready) {
          sendDone(debugId);
        } else {
          addWithLimit(droppedIds, debugId, MAX_REMEMBERED_IDS);
        }
      };

      hot.on(DEBUG_CMD_EVENT, (payload) => {
        assertIsDebugEventPayload(payload);
        const session = sessions.get(payload.i);
        if ('d' in payload) {
          if (session) {
            closeCmdController(session);
          }
          return;
        }
        if ('b' in payload) {
          if (session) {
            enqueueCmdChunk(session, base64ToBytes(payload.b));
          }
          return;
        }
        if (!session) {
          if (droppedIds.delete(payload.i)) {
            sendDone(payload.i);
          } else {
            addWithLimit(earlyReadyIds, payload.i, MAX_REMEMBERED_IDS);
          }
          return;
        }
        session.ready = true;
        for (const chunk of session.pendingChunks) {
          sendChunk(payload.i, chunk);
        }
        session.pendingChunks.length = 0;
        updateWaiting(payload.i, session);
        cleanupIfDone(payload.i, session);
      });

      const registerDebugChannel = (debugId: string) => {
        const session = getSession(debugId);
        session.requestDone = false;
        updateWaiting(debugId, session);
        let deactivatePrevious: (() => void) | undefined;
        const createDebugChannel = () => {
          // The browser only receives the last render in a request.
          deactivatePrevious?.();
          session.streamOpened = true;
          updateWaiting(debugId, session);
          let active = true;
          deactivatePrevious = () => {
            active = false;
            closeCmdController(session);
            session.pendingChunks.length = 0;
            session.streamClosed = false;
          };
          const readable = new ReadableStream<Uint8Array>({
            start(controller) {
              if (session.dropped) {
                controller.close();
                return;
              }
              session.cmdController = controller;
            },
            cancel() {
              if (active) {
                delete session.cmdController;
              }
            },
          });
          const closeStream = () => {
            if (!active) {
              return;
            }
            session.streamClosed = true;
            cleanupIfDone(debugId, session);
          };
          const writable = new WritableStream<Uint8Array>({
            write(chunk) {
              if (!active || session.dropped) {
                return;
              }
              if (session.ready) {
                sendChunk(debugId, chunk);
              } else {
                session.pendingChunks.push(chunk);
              }
            },
            close: closeStream,
            abort: closeStream,
          });
          return { writable, readable };
        };
        const finishDebugChannel = () => {
          session.requestDone = true;
          updateWaiting(debugId, session);
          cleanupIfDone(debugId, session);
        };
        getDebugChannelRegistry().set(debugId, [
          createDebugChannel,
          finishDebugChannel,
        ]);
      };

      return () => {
        server.middlewares.use((req, _res, next) => {
          const clientDebugId = req.headers[DEBUG_ID_HEADER.toLowerCase()];
          const hasClientDebugId = typeof clientDebugId === 'string';
          const isHtmlRequest = req.headers.accept?.includes('text/html');
          if (!hasClientDebugId && !isHtmlRequest) {
            next();
            return;
          }

          const debugId = hasClientDebugId
            ? clientDebugId
            : crypto.randomUUID();
          if (!hasClientDebugId) {
            setRequestHeader(req, DEBUG_ID_HEADER, debugId);
          }
          registerDebugChannel(debugId);
          next();
        });
      };
    },
  };
}
