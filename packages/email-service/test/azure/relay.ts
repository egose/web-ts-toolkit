import { once } from 'node:events';
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import { finished } from 'node:stream/promises';

export type Call = {
  method: string | undefined;
  path: string;
  queryKeys: string[];
  headers: IncomingHttpHeaders;
  status?: number;
  code?: string;
};

type Fault = (call: Call, source: IncomingMessage, reply: ServerResponse) => Promise<boolean> | boolean;

export async function drain(source: IncomingMessage) {
  source.resume();
  await finished(source, { cleanup: true });
}

/** Record no Authorization, account keys or SAS values; only forward to this suite's emulator. */
export async function startAzureRelay(endpoint: string) {
  const calls: Call[] = [];
  const faults: Fault[] = [];
  const server = createServer((incoming, reply) => {
    const url = new URL(incoming.url ?? '/', endpoint);
    const call: Call = {
      method: incoming.method,
      path: url.pathname,
      queryKeys: [...url.searchParams.keys()],
      headers: Object.fromEntries(
        Object.entries(incoming.headers).filter(([key]) =>
          /^(?:if-none-match|content-length|content-md5|range|x-ms-range|x-ms-blob-type|x-ms-blob-content-type|x-ms-version|x-ms-meta-.*)$/.test(
            key,
          ),
        ),
      ),
    };
    calls.push(call);
    const upstream = request(endpoint, {
      method: incoming.method ?? 'GET',
      path: url.pathname + url.search,
      headers: incoming.headers,
      agent: false,
    });
    upstream.on('error', () => reply.destroy());
    incoming.on('error', () => upstream.destroy());
    reply.once('close', () => {
      if (!reply.writableFinished) upstream.destroy();
    });
    upstream.once('response', (source) => {
      source.on('error', () => reply.destroy());
      call.status = source.statusCode ?? 0;
      const code = source.headers['x-ms-error-code'];
      if (typeof code === 'string') call.code = code;
      const forward = async () => {
        for (const fault of faults) {
          if (await fault(call, source, reply)) return;
        }
        reply.writeHead(call.status ?? 500, source.headers);
        source.pipe(reply);
      };
      void forward().catch(() => reply.destroy());
    });
    incoming.pipe(upstream);
  });
  server.listen({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback relay port');
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    calls,
    faults,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}
