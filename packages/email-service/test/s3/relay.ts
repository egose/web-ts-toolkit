import { once } from 'node:events';
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';

export type Call = {
  method: string | undefined;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  status?: number;
};
export type RelayFault = (call: Call, source: IncomingMessage, reply: ServerResponse) => Promise<boolean> | boolean;

/** Loopback relay used only for HTTP fault injection; the upstream is always the freshly launched fixture. */
export async function startS3Relay(endpoint: string) {
  const calls: Call[] = [];
  const faults: RelayFault[] = [];
  const server = createServer((incoming, reply) => {
    const url = new URL(incoming.url ?? '/', endpoint);
    const call: Call = {
      method: incoming.method,
      path: url.pathname,
      query: url.searchParams,
      headers: Object.fromEntries(
        Object.entries(incoming.headers).filter(([k]) =>
          /^(?:if-none-match|content-length|content-type|x-amz-meta-.*|x-amz-checksum-.*)$/.test(k),
        ),
      ),
    };
    calls.push(call);
    const upstream = request(endpoint, {
      method: incoming.method ?? 'GET',
      path: url.pathname + url.search,
      headers: incoming.headers,
    });
    upstream.on('error', () => reply.destroy());
    reply.once('close', () => {
      if (!reply.writableFinished) upstream.destroy();
    });
    upstream.once('response', (source) => {
      source.on('error', () => reply.destroy());
      source.once('close', () => {
        if (!source.complete) reply.destroy();
      });
      call.status = source.statusCode ?? 0;
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
  if (!address || typeof address === 'string') throw new Error('Expected loopback relay port');
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
