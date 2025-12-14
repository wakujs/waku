/**
 * Internal SSR utilities for server-inserted HTML.
 * This module provides the context and rendering utilities for collecting
 * and injecting HTML content (like CSS-in-JS styles) during streaming SSR.
 */

import type { JSX, ReactNode } from 'react';
import * as React from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { streamToString } from './stream-transforms.js';

export type ServerInsertedHTMLHook = (callback: () => ReactNode) => void;

/**
 * Context for collecting server-inserted HTML callbacks.
 * Used by CSS-in-JS libraries to inject styles during SSR.
 *
 * We use `React.createContext` to avoid errors from RSC checks because
 * it can't be imported directly in Server Components.
 */
export const ServerInsertedHTMLContext =
  React.createContext<ServerInsertedHTMLHook | null>(null);

/**
 * Creates the provider and render function for server-inserted HTML.
 * This is used internally by Waku's SSR rendering pipeline.
 */
export function createServerInsertedHTML(): {
  ServerInsertedHTMLProvider: ({
    children,
  }: {
    children: JSX.Element;
  }) => JSX.Element;
  renderServerInsertedHTML: () => ReactNode;
} {
  const serverInsertedHTMLCallbacks: Array<() => ReactNode> = [];

  const addInsertedHtml = (handler: () => ReactNode) => {
    serverInsertedHTMLCallbacks.push(handler);
  };

  return {
    ServerInsertedHTMLProvider({ children }: { children: JSX.Element }) {
      return (
        <ServerInsertedHTMLContext.Provider value={addInsertedHtml}>
          {children}
        </ServerInsertedHTMLContext.Provider>
      );
    },
    renderServerInsertedHTML() {
      return serverInsertedHTMLCallbacks.map((callback, index) => (
        <React.Fragment key={'__waku_server_inserted__' + index}>
          {callback()}
        </React.Fragment>
      ));
    },
  };
}

/**
 * Creates a function that renders server-inserted HTML to a string.
 * This is used to inject CSS-in-JS styles and other content during streaming.
 */
export function makeGetServerInsertedHTML(
  renderServerInsertedHTML: () => ReactNode,
): () => Promise<string> {
  return async function getServerInsertedHTML(): Promise<string> {
    const serverInsertedHTML = renderServerInsertedHTML();

    // Skip rendering if there's nothing to insert
    if (
      serverInsertedHTML === null ||
      serverInsertedHTML === undefined ||
      (Array.isArray(serverInsertedHTML) && serverInsertedHTML.length === 0)
    ) {
      return '';
    }

    // Render the collected HTML to a stream and convert to string
    const stream = await renderToReadableStream(<>{serverInsertedHTML}</>, {
      // Larger chunk size since this isn't sent over the network
      progressiveChunkSize: 1024 * 1024,
    });

    return streamToString(stream);
  };
}
