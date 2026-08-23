import http from 'node:http';
import type { Express } from 'express';
import { startLocalServer, type LocalServer, type LocalServerOptions } from '../../src/index';
import { waitForListening } from './events';

/**
 * Tracked server helper that ensures deterministic cleanup.
 * Collects servers and always awaits close, without removing unrelated listeners.
 */
export class ServerHarness {
  private servers: LocalServer[] = [];
  private httpServers: http.Server[] = [];

  async start(app: Express, options: LocalServerOptions = {}): Promise<{ local: LocalServer; port: number }> {
    const local = startLocalServer(app, {
      ...options,
      host: options.host ?? '127.0.0.1',
      port: options.port ?? 0,
      signals: options.signals ?? false,
    });
    this.servers.push(local);
    this.httpServers.push(local.server);
    const { port } = await waitForListening(local.server);
    return { local, port };
  }

  /**
   * Shutdown all tracked servers deterministically.
   * Awaits each shutdown and ensures server is closed.
   */
  async cleanup(): Promise<void> {
    for (const local of this.servers.splice(0)) {
      try {
        await local.shutdown();
      } catch (_e) {
        void _e;
      }
      // Ensure underlying server is closed if shutdown didn't close it
      if (local.server.listening) {
        await new Promise<void>((resolve) => {
          local.server.close(() => resolve());
          // Force close after 1s
          setTimeout(() => {
            try {
              local.server.closeAllConnections?.();
            } catch (_e) {
              void _e;
            }
            resolve();
          }, 1000).unref?.();
        });
      }
    }
    for (const s of this.httpServers.splice(0)) {
      if (s.listening) {
        await new Promise<void>((resolve) => {
          s.close(() => resolve());
          setTimeout(() => resolve(), 1000).unref?.();
        });
      }
    }
  }
}

/**
 * Helper to create a request barrier: resolves when request handler is entered.
 * Avoids fixed sleeps before shutdown.
 */
export function createRequestBarrier(): {
  onRequestEntered: () => void;
  waitForEntry: () => Promise<void>;
  entered: boolean;
} {
  let entered = false;
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return {
    onRequestEntered: () => {
      if (!entered) {
        entered = true;
        resolve();
      }
    },
    waitForEntry: () => promise,
    get entered() {
      return entered;
    },
  };
}
