import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { BadRequestError } from '@web-ts-toolkit/http-errors';
import { createHandler, ErrorFormats } from '../dist/index.mjs';
import { createInstrumentedApp, type InstrumentedApp, type ProcessErrorCapture } from './helpers/lifecycle';

describe('Response pipeline safety (ERH-02)', () => {
  let instrumented: InstrumentedApp;
  let processCapture: ProcessErrorCapture | undefined;

  afterEach(() => {
    instrumented?.dispose();
    processCapture?.dispose();
    processCapture = undefined;
    instrumented = undefined as never;
  });

  const buildWithHandler = (captureProcess = true) => {
    instrumented = createInstrumentedApp({ captureProcess });
    processCapture = instrumented.processCapture ?? undefined;
    const handler = createHandler();
    instrumented.app.use(instrumented.tracker.attachedMiddleware);
    return { ...instrumented, handler };
  };

  const expectTerminatesOnce = async (run: () => Promise<request.Response>, expectProbeReached: boolean) => {
    const response = await run();

    expect(instrumented.tracker.finishedOnce).toBe(true);
    if (expectProbeReached) {
      expect(instrumented.probe.errorMiddlewareReachedOnce).toBe(true);
    } else {
      expect(instrumented.probe.errorMiddlewareNeverReached).toBe(true);
    }
    expect(processCapture?.observedUnhandledRejection).toBe(false);
    expect(processCapture?.observedUncaughtException).toBe(false);
    return response;
  };

  it('terminates deterministically when a handler throws null', async () => {
    const { app, probe, handler } = buildWithHandler();
    probe.install();
    app.get(
      '/throw-null',
      handler.handleResponse(() => {
        throw null;
      }),
    );

    await expectTerminatesOnce(
      () =>
        request(app)
          .get('/throw-null')
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          }),
      false,
    );
  });

  it('terminates deterministically when a handler throws undefined', async () => {
    const { app, probe, handler } = buildWithHandler();
    probe.install();
    app.get(
      '/throw-undefined',
      handler.handleResponse(() => {
        throw undefined;
      }),
    );

    await expectTerminatesOnce(
      () =>
        request(app)
          .get('/throw-undefined')
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          }),
      false,
    );
  });

  it('terminates deterministically when a handler throws a string', async () => {
    const { app, probe, handler } = buildWithHandler();
    probe.install();
    app.get(
      '/throw-string',
      handler.handleResponse(() => {
        throw 'string-error';
      }),
    );

    await expectTerminatesOnce(
      () =>
        request(app)
          .get('/throw-string')
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          }),
      false,
    );
  });

  it('terminates deterministically when a handler throws a plain object', async () => {
    const plainObject = { custom: 'failure' };
    const { app, probe, handler } = buildWithHandler();
    probe.install();
    app.get(
      '/throw-object',
      handler.handleResponse(() => {
        throw plainObject;
      }),
    );

    await expectTerminatesOnce(
      () =>
        request(app)
          .get('/throw-object')
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          }),
      false,
    );
  });

  it('terminates deterministically when a handler rejects with null', async () => {
    const { app, probe, handler } = buildWithHandler();
    probe.install();
    app.get(
      '/reject-null',
      handler.handleResponse(() => Promise.reject(null)),
    );

    await expectTerminatesOnce(
      () =>
        request(app)
          .get('/reject-null')
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          }),
      false,
    );
  });

  it('a throwing error provider reaches Express error middleware exactly once', async () => {
    const { app, probe, handler } = buildWithHandler();
    handler.errorMessageProvider = function () {
      throw new Error('provider-failure');
    };

    app.get(
      '/provider-throws',
      handler.handleResponse(() => {
        throw new Error('original-error');
      }),
    );
    probe.install();

    const response = await expectTerminatesOnce(() => request(app).get('/provider-throws').expect(500), true);

    expect(response.body.message).toBe('probe-error-middleware');
  });

  it('a throwing pre-error hook delegates to a deterministic terminal response', async () => {
    const { app, probe, handler } = buildWithHandler();
    handler.preError = function () {
      throw new Error('pre-error-failure');
    };

    app.get(
      '/pre-error-throws',
      handler.handleResponse(() => {
        throw new Error('original-error');
      }),
    );
    probe.install();

    await expectTerminatesOnce(() => request(app).get('/pre-error-throws').expect(500), false);
  });

  it('a rejecting pre-error hook delegates to a deterministic terminal response', async () => {
    const { app, probe, handler } = buildWithHandler();
    handler.preError = function () {
      return Promise.reject(new Error('pre-error-rejection'));
    };

    app.get(
      '/pre-error-rejects',
      handler.handleResponse(() => {
        throw new Error('original-error');
      }),
    );
    probe.install();

    await expectTerminatesOnce(() => request(app).get('/pre-error-rejects').expect(500), false);
  });

  it('a throwing pre-json hook delegates to a deterministic terminal response', async () => {
    const { app, probe, handler } = buildWithHandler();
    handler.preJson = function () {
      throw new Error('pre-json-failure');
    };

    app.get(
      '/pre-json-throws',
      handler.handleResponse(() => 'apple'),
    );
    probe.install();

    await expectTerminatesOnce(() => request(app).get('/pre-json-throws').expect(500), false);
  });

  it('a rejecting pre-json hook delegates to a deterministic terminal response', async () => {
    const { app, probe, handler } = buildWithHandler();
    handler.preJson = function () {
      return Promise.reject(new Error('pre-json-rejection'));
    };

    app.get(
      '/pre-json-rejects',
      handler.handleResponse(() => 'apple'),
    );
    probe.install();

    await expectTerminatesOnce(() => request(app).get('/pre-json-rejects').expect(500), false);
  });

  it('a throwing res.json delegates to Express error middleware exactly once', async () => {
    const instrumentedApp = createInstrumentedApp({ captureProcess: true });
    instrumented = instrumentedApp;
    processCapture = instrumentedApp.processCapture ?? undefined;
    const { app, probe, tracker } = instrumentedApp;
    app.use(tracker.attachedMiddleware);
    const handler = createHandler();

    app.use((_req, res, next) => {
      res.json = (() => {
        throw new Error('res.json-failure');
      }) as never;
      next();
    });
    app.get(
      '/res-json-throws',
      handler.handleResponse(() => 'apple'),
    );
    probe.install();

    await expectTerminatesOnce(() => request(app).get('/res-json-throws').expect(500), true);
  });

  it('a throwing res.send delegates to Express error middleware exactly once', async () => {
    const instrumentedApp = createInstrumentedApp({ captureProcess: true });
    instrumented = instrumentedApp;
    processCapture = instrumentedApp.processCapture ?? undefined;
    const { app, probe, tracker } = instrumentedApp;
    app.use(tracker.attachedMiddleware);
    const handler = createHandler();

    app.use((_req, res, next) => {
      res.send = (() => {
        throw new Error('res.send-failure');
      }) as never;
      next();
    });
    app.get(
      '/res-send-throws',
      handler.handleResponse(() => {
        throw new BadRequestError('bad');
      }),
    );
    probe.install();

    await expectTerminatesOnce(() => request(app).get('/res-send-throws').expect(500), true);
  });

  it('a throwing res.set delegates to Express error middleware exactly once', async () => {
    const instrumentedApp = createInstrumentedApp({ captureProcess: true });
    instrumented = instrumentedApp;
    processCapture = instrumentedApp.processCapture ?? undefined;
    const { app, probe, tracker } = instrumentedApp;
    app.use(tracker.attachedMiddleware);
    const problemHandler = createHandler({
      errorFormat: ErrorFormats.rfc9457,
      errorDomain: 'api.example.com',
    });

    app.use((_req, res, next) => {
      res.set = (() => {
        throw new Error('res.set-failure');
      }) as never;
      next();
    });
    app.get(
      '/res-set-throws',
      problemHandler.handleResponse(() => {
        throw new BadRequestError('bad');
      }),
    );
    probe.install();

    await expectTerminatesOnce(() => request(app).get('/res-set-throws').expect(500), true);
  });

  it('a throw after res.write reaches error middleware and no second body is attempted', async () => {
    const instrumentedApp = createInstrumentedApp({ captureProcess: true });
    instrumented = instrumentedApp;
    processCapture = instrumentedApp.processCapture ?? undefined;
    const { app, probe, tracker } = instrumentedApp;
    app.use(tracker.attachedMiddleware);
    const handler = createHandler();
    let sendAttempts = 0;

    app.use((_req, res, next) => {
      const originalSend = res.send.bind(res);
      res.send = ((body: unknown) => {
        sendAttempts += 1;
        return originalSend(body);
      }) as never;
      next();
    });

    app.get(
      '/write-then-throw',
      handler.handleResponse((_req, res) => {
        res.write('partial');
        throw new Error('after-write');
      }),
    );
    probe.install();

    await request(app)
      .get('/write-then-throw')
      .catch(() => {
        // Headers were already committed by res.write; the connection may
        // abort after the probe forwards to Express final handler. Treat the
        // abort as the expected terminal signal for a partial response.
      });

    expect(probe.errorMiddlewareReachedOnce).toBe(true);
    expect(sendAttempts).toBe(0);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
    expect(processCapture?.observedUncaughtException).toBe(false);
  });

  it('does not recursively invoke a failing error formatter', async () => {
    const { app, probe, handler } = buildWithHandler();
    let providerCalls = 0;
    handler.errorMessageProvider = function () {
      providerCalls += 1;
      throw new Error('recursive-provider');
    };

    app.get(
      '/recursive-formatter',
      handler.handleResponse(() => {
        throw new Error('original');
      }),
    );
    probe.install();

    const response = await expectTerminatesOnce(() => request(app).get('/recursive-formatter').expect(500), true);
    void response;

    expect(providerCalls).toBe(1);
  });

  it('reports a normal post-json failure after automatic send without a second body', async () => {
    const { app, probe, handler } = buildWithHandler();
    const postFailure = new Error('post-json-observation');
    let resolveObserved: () => void = () => undefined;
    const observed = new Promise<void>((resolve) => {
      resolveObserved = resolve;
    });
    const seen: unknown[] = [];
    const probeWithCapture = { ...probe };

    void probeWithCapture;
    handler.postJson = function () {
      return Promise.reject(postFailure);
    };

    app.get(
      '/post-json-observation',
      handler.handleResponse(() => 'apple'),
    );
    app.use((err: unknown, _req: unknown, res: { headersSent: boolean }, next: (e?: unknown) => void) => {
      seen.push(err);
      resolveObserved();
      next(err);
    });
    probe.install();

    const response = await request(app).get('/post-json-observation').expect(200);

    expect(response.body).toBe('apple');
    await observed;
    expect(seen).toEqual([postFailure]);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it('one terminal owner wins: post-json observation is not displaced by a delayed callback', async () => {
    const { app, probe, handler } = buildWithHandler();
    const postFailure = new Error('post-json-owner');
    const lateFailure = new Error('late-callback-error');
    const seen: unknown[] = [];
    let resolveFirstReport: () => void = () => undefined;
    const firstReport = new Promise<void>((resolve) => {
      resolveFirstReport = resolve;
    });
    let storedNext: ((err: unknown) => void) | undefined;

    handler.postJson = function () {
      return Promise.reject(postFailure);
    };

    app.get(
      '/single-owner-with-observation',
      handler.handleResponse((_req, _res, next) => {
        storedNext = (err: unknown) => next(err);
        return 'apple';
      }),
    );
    app.use((err: unknown, _req: unknown, _res: unknown, next: (e?: unknown) => void) => {
      seen.push(err);
      resolveFirstReport();
      next(err);
    });
    probe.install();

    const response = await request(app).get('/single-owner-with-observation').expect(200);

    expect(response.body).toBe('apple');
    await firstReport;
    expect(seen).toEqual([postFailure]);

    storedNext?.(lateFailure);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toEqual([postFailure]);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });
});

describe('Arbitrary thrown values stay on the error channel (B-ERH-02)', () => {
  let instrumented: InstrumentedApp;
  let processCapture: ProcessErrorCapture | undefined;

  afterEach(() => {
    instrumented?.dispose();
    processCapture?.dispose();
    processCapture = undefined;
    instrumented = undefined as never;
  });

  const build = () => {
    instrumented = createInstrumentedApp({ captureProcess: true });
    processCapture = instrumented.processCapture ?? undefined;
    const handler = createHandler();
    instrumented.app.use(instrumented.tracker.attachedMiddleware);
    return { ...instrumented, handler };
  };

  const falsySentinelCases: Array<{ label: string; value: unknown }> = [
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'false', value: false },
    { label: 'zero', value: 0 },
    { label: 'empty-string', value: '' },
    { label: 'route-sentinel', value: 'route' },
    { label: 'router-sentinel', value: 'router' },
    { label: 'symbol', value: Symbol('boom') },
    { label: 'plain-object', value: { custom: 'failure' } },
    { label: 'string-error', value: 'string-error' },
  ];

  const expectTerminalError = (received: unknown, original: unknown) => {
    expect(received).toBeInstanceOf(Error);
    if (original instanceof Error) {
      expect(received).toBe(original);
      return;
    }
    expect((received as Error & { cause: unknown }).cause).toBe(original);
  };

  for (const { label, value } of falsySentinelCases) {
    it(`post-write sync throw (${label}) reaches error middleware once without regular continuation`, async () => {
      const { app, probe, handler } = build();
      let regularDownstreamHit = false;

      app.get(
        `/post-write-throw-${label}`,
        handler.handleResponse((_req, res) => {
          res.write('partial');
          throw value;
        }),
      );
      app.use((_req, res, _next) => {
        void _next;
        regularDownstreamHit = true;
        if (!res.headersSent) {
          res.status(200).json({ continued: true });
          return;
        }
        try {
          res.end('regular-downstream');
        } catch {
          // Ignore a second end after the partial write.
        }
      });
      probe.install();

      await request(app)
        .get(`/post-write-throw-${label}`)
        .catch(() => {
          // Headers were already committed by res.write; the connection may
          // abort after the probe forwards to the Express final handler.
        });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(probe.errorMiddlewareReachedOnce).toBe(true);
      expect(regularDownstreamHit).toBe(false);
      expectTerminalError(probe.errorMiddlewareCalls[0], value);
      expect(processCapture?.observedUnhandledRejection).toBe(false);
      expect(processCapture?.observedUncaughtException).toBe(false);
    });

    it(`post-write rejection (${label}) reaches error middleware once without regular continuation`, async () => {
      const { app, probe, handler } = build();
      let regularDownstreamHit = false;

      app.get(
        `/post-write-reject-${label}`,
        handler.handleResponse((_req, res) => {
          res.write('partial');
          return Promise.reject(value);
        }),
      );
      app.use((_req, res, _next) => {
        void _next;
        regularDownstreamHit = true;
        if (!res.headersSent) {
          res.status(200).json({ continued: true });
          return;
        }
        try {
          res.end('regular-downstream');
        } catch {
          // Ignore a second end after the partial write.
        }
      });
      probe.install();

      await request(app)
        .get(`/post-write-reject-${label}`)
        .catch(() => {
          // Partial writes abort the connection once the probe forwards.
        });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(probe.errorMiddlewareReachedOnce).toBe(true);
      expect(regularDownstreamHit).toBe(false);
      expectTerminalError(probe.errorMiddlewareCalls[0], value);
      expect(processCapture?.observedUnhandledRejection).toBe(false);
      expect(processCapture?.observedUncaughtException).toBe(false);
    });

    it(`post-json rejection (${label}) is reported once without a second body`, async () => {
      const { app, probe, handler } = build();
      const seen: unknown[] = [];
      let resolveObserved: () => void = () => undefined;
      const observed = new Promise<void>((resolve) => {
        resolveObserved = resolve;
      });
      let regularDownstreamHit = false;

      handler.postJson = function () {
        return Promise.reject(value);
      };

      app.get(
        `/post-json-reject-${label}`,
        handler.handleResponse(() => 'apple'),
      );
      app.use((_req, _res, next) => {
        regularDownstreamHit = true;
        next();
      });
      app.use((err: unknown, _req: unknown, _res: unknown, next: (e?: unknown) => void) => {
        seen.push(err);
        resolveObserved();
        next(err);
      });
      probe.install();

      const response = await request(app).get(`/post-json-reject-${label}`).expect(200);

      expect(response.body).toBe('apple');
      await observed;
      await new Promise((resolve) => setImmediate(resolve));
      expect(seen).toHaveLength(1);
      expect(probe.errorMiddlewareReachedOnce).toBe(true);
      expect(regularDownstreamHit).toBe(false);
      expectTerminalError(seen[0], value);
      expectTerminalError(probe.errorMiddlewareCalls[0], value);
      expect(processCapture?.observedUnhandledRejection).toBe(false);
    });

    it(`provider throw (${label}) reaches error middleware once without regular continuation`, async () => {
      const { app, probe, handler } = build();
      let regularDownstreamHit = false;
      const thrown: unknown = value;

      handler.errorMessageProvider = function (): never {
        throw thrown;
      };

      app.get(
        `/provider-throw-${label}`,
        handler.handleResponse(() => {
          throw new Error('original-error');
        }),
      );
      app.use((_req, res, next) => {
        regularDownstreamHit = true;
        if (!res.headersSent) {
          res.status(200).json({ continued: true });
          return;
        }
        next();
      });
      probe.install();

      await request(app).get(`/provider-throw-${label}`).expect(500);
      await new Promise((resolve) => setImmediate(resolve));

      expect(probe.errorMiddlewareReachedOnce).toBe(true);
      expect(regularDownstreamHit).toBe(false);
      expectTerminalError(probe.errorMiddlewareCalls[0], thrown);
      expect(processCapture?.observedUnhandledRejection).toBe(false);
      expect(processCapture?.observedUncaughtException).toBe(false);
    });
  }

  it('preserves ordinary Error identity on the terminal channel', async () => {
    const { app, probe, handler } = build();
    const terminal = new Error('terminal-identity');
    let regularDownstreamHit = false;

    app.get(
      '/terminal-error-identity',
      handler.handleResponse((_req, res) => {
        res.write('partial');
        throw terminal;
      }),
    );
    app.use((_req, res, next) => {
      regularDownstreamHit = true;
      try {
        res.end('regular-downstream');
      } catch {
        // Ignore a second end after the partial write.
      }
      void next;
    });
    probe.install();

    await request(app)
      .get('/terminal-error-identity')
      .catch(() => {
        // Partial writes abort once the probe forwards the terminal error.
      });
    await new Promise((resolve) => setImmediate(resolve));

    expect(probe.errorMiddlewareReachedOnce).toBe(true);
    expect(regularDownstreamHit).toBe(false);
    expect(probe.errorMiddlewareCalls[0]).toBe(terminal);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it("thrown 'route' does not route while explicit next('route') still routes", async () => {
    const { app, probe, handler } = build();
    let regularDownstreamHit = false;
    let secondRouteHit = false;

    app.get(
      '/thrown-route-sentinel',
      handler.handleResponse((_req, res) => {
        res.write('partial');
        throw 'route';
      }),
    );
    app.use((_req, res, next) => {
      regularDownstreamHit = true;
      if (!res.headersSent) {
        res.status(200).json({ continued: true });
        return;
      }
      try {
        res.end('regular-downstream');
      } catch {
        // Ignore a second end after the partial write.
      }
      void next;
    });
    probe.install();

    await request(app)
      .get('/thrown-route-sentinel')
      .catch(() => {
        // Partial writes abort once the probe forwards the terminal error.
      });
    await new Promise((resolve) => setImmediate(resolve));

    expect(probe.errorMiddlewareReachedOnce).toBe(true);
    expect(regularDownstreamHit).toBe(false);
    expect(probe.errorMiddlewareCalls[0]).toBeInstanceOf(Error);
    expect((probe.errorMiddlewareCalls[0] as Error & { cause: unknown }).cause).toBe('route');

    const explicitApp = express();
    const explicitHandler = createHandler();
    explicitApp.get(
      '/explicit-route',
      explicitHandler.handleResponse((_req, _res, next) => {
        next('route');
        return 'first-route';
      }),
      (_req, res) => res.json({ route: 'same' }),
    );
    explicitApp.get('/explicit-route', (_req, res) => {
      secondRouteHit = true;
      res.json({ route: 'next' });
    });

    const response = await request(explicitApp).get('/explicit-route').expect(200);

    expect(response.body).toEqual({ route: 'next' });
    expect(secondRouteHit).toBe(true);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });
});

describe('Hook and serialization error lifecycle (B-ERH-03)', () => {
  let instrumented: InstrumentedApp;
  let processCapture: ProcessErrorCapture | undefined;

  afterEach(() => {
    instrumented?.dispose();
    processCapture?.dispose();
    processCapture = undefined;
    instrumented = undefined as never;
  });

  const build = () => {
    instrumented = createInstrumentedApp({ captureProcess: true });
    processCapture = instrumented.processCapture ?? undefined;
    const handler = createHandler();
    instrumented.app.use(instrumented.tracker.attachedMiddleware);
    return { ...instrumented, handler };
  };

  const secret = 'sentinel-secret-berh-03'; // pragma: allowlist secret

  it('circular JSON produces one redacted error with one preError and one finish-timed postError, no postJson', async () => {
    const { app, probe, tracker, handler } = build();
    const preErrors: unknown[] = [];
    const postErrors: unknown[] = [];
    let postJsonCalls = 0;
    let postFinished = false;
    let resolvePost: () => void = () => undefined;
    const postDone = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });

    handler.preError = function (err: unknown) {
      preErrors.push(err);
    };
    handler.postError = function () {
      postFinished = tracker.finishedOnce;
      postErrors.push('post');
      resolvePost();
    };
    handler.postJson = function () {
      postJsonCalls += 1;
    };

    app.get(
      '/circular',
      handler.handleResponse(() => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return circular;
      }),
    );
    probe.install();

    const response = await request(app).get('/circular').expect(500);
    await postDone;

    expect(response.body).toEqual({ message: 'Internal Server Error' });
    expect(JSON.stringify(response.body)).not.toContain('circular');
    expect(preErrors).toHaveLength(1);
    expect(postErrors).toHaveLength(1);
    expect(postFinished).toBe(true);
    expect(postJsonCalls).toBe(0);
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it('BigInt JSON produces one redacted error with one preError and one finish-timed postError, no postJson', async () => {
    const { app, probe, tracker, handler } = build();
    const preErrors: unknown[] = [];
    let postCount = 0;
    let postFinished = false;
    let resolvePost: () => void = () => undefined;
    const postDone = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    let postJsonCalls = 0;

    handler.preError = function (err: unknown) {
      preErrors.push(err);
    };
    handler.postError = function () {
      postFinished = tracker.finishedOnce;
      postCount += 1;
      resolvePost();
    };
    handler.postJson = function () {
      postJsonCalls += 1;
    };

    app.get(
      '/bigint',
      handler.handleResponse(() => ({ value: 10n })),
    );
    probe.install();

    const response = await request(app).get('/bigint').expect(500);
    await postDone;

    expect(response.body).toEqual({ message: 'Internal Server Error' });
    expect(preErrors).toHaveLength(1);
    expect(postCount).toBe(1);
    expect(postFinished).toBe(true);
    expect(postJsonCalls).toBe(0);
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it('rejected preJson produces one redacted error with one preError and one finish-timed postError, no postJson', async () => {
    const { app, probe, tracker, handler } = build();
    const original = new Error(`pre-hook secret ${secret}`);
    const preErrors: unknown[] = [];
    const postErrors: unknown[] = [];
    let postJsonCalls = 0;
    let postFinished = false;
    let resolvePost: () => void = () => undefined;
    const postDone = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });

    handler.preJson = function () {
      return Promise.reject(original);
    };
    handler.preError = function (err: unknown) {
      preErrors.push(err);
    };
    handler.postError = function (err: unknown) {
      postFinished = tracker.finishedOnce;
      postErrors.push(err);
      resolvePost();
    };
    handler.postJson = function () {
      postJsonCalls += 1;
    };

    app.get(
      '/pre-json-rejects-secret',
      handler.handleResponse(() => 'apple'),
    );
    probe.install();

    const response = await request(app).get('/pre-json-rejects-secret').expect(500);
    await postDone;

    expect(response.body).toEqual({ message: 'Internal Server Error' });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(preErrors).toEqual([original]);
    expect(postErrors).toEqual([original]);
    expect(postFinished).toBe(true);
    expect(postJsonCalls).toBe(0);
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it('CSV pre-output failure produces one redacted error with one preError and one postError, no postJson', async () => {
    const { app, probe, tracker, handler } = build();
    const original = new Error(`csv secret ${secret}`);
    const preErrors: unknown[] = [];
    const postErrors: unknown[] = [];
    let postJsonCalls = 0;
    let resolvePost: () => void = () => undefined;
    const postDone = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });

    handler.preError = function (err: unknown) {
      preErrors.push(err);
    };
    handler.postError = function (err: unknown) {
      postErrors.push(err);
      resolvePost();
    };
    handler.postJson = function () {
      postJsonCalls += 1;
    };

    const { CSVResponse } = await import('../dist/responses/csv.mjs');

    app.get(
      '/csv-pre-output-failure',
      handler.handleResponse(
        () =>
          new CSVResponse([['ok']], {
            processor: () => {
              throw original;
            },
          }),
      ),
    );
    probe.install();

    const response = await request(app).get('/csv-pre-output-failure').expect(500);
    await postDone;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(response.body).toEqual({ message: 'Internal Server Error' });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(preErrors).toEqual([original]);
    expect(postErrors).toEqual([original]);
    expect(postJsonCalls).toBe(0);
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it('manual sync response gets no success hooks and no unsolicited 500', async () => {
    const { app, probe, handler } = build();
    let preJsonCalls = 0;
    let postJsonCalls = 0;

    handler.preJson = function () {
      preJsonCalls += 1;
    };
    handler.postJson = function () {
      postJsonCalls += 1;
    };

    app.get(
      '/manual-sync',
      handler.handleResponse((_req, res) => {
        res.json({ ok: true });
      }),
    );
    probe.install();

    const response = await request(app).get('/manual-sync').expect(200);

    expect(response.body).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(preJsonCalls).toBe(0);
    expect(postJsonCalls).toBe(0);
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it('manual callback response gets no success hooks and no unsolicited 500', async () => {
    const { app, probe, handler } = build();
    let preJsonCalls = 0;
    let postJsonCalls = 0;

    handler.preJson = function () {
      preJsonCalls += 1;
    };
    handler.postJson = function () {
      postJsonCalls += 1;
    };

    app.get(
      '/manual-callback',
      handler.handleResponse((_req, res) => {
        setTimeout(() => {
          res.json({ ok: true });
        }, 5);
      }),
    );
    probe.install();

    const response = await request(app).get('/manual-callback').expect(200);

    expect(response.body).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(preJsonCalls).toBe(0);
    expect(postJsonCalls).toBe(0);
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
  });

  it('partial write then async preJson success delegates to error middleware without a second body', async () => {
    const instrumentedApp = createInstrumentedApp({ captureProcess: true });
    instrumented = instrumentedApp;
    processCapture = instrumentedApp.processCapture ?? undefined;
    const { app, probe, tracker } = instrumentedApp;
    app.use(tracker.attachedMiddleware);
    const handler = createHandler();
    let sendAttempts = 0;

    handler.preJson = async function () {
      await new Promise((resolve) => setTimeout(resolve, 5));
    };

    app.use((_req, res, next) => {
      const originalSend = res.send.bind(res);
      res.send = ((body: unknown) => {
        sendAttempts += 1;
        return originalSend(body);
      }) as never;
      next();
    });

    app.get(
      '/partial-then-prejson-success',
      handler.handleResponse((_req, res) => {
        res.write('partial');
        return 'apple';
      }),
    );
    probe.install();

    await request(app)
      .get('/partial-then-prejson-success')
      .catch(() => {
        // Partial responses abort once the probe forwards the terminal error.
      });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(probe.errorMiddlewareReachedOnce).toBe(true);
    expect(sendAttempts).toBe(0);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
    expect(processCapture?.observedUncaughtException).toBe(false);
  });

  it('partial write then rejected preJson runs preError once and terminates via error middleware without a second body', async () => {
    const instrumentedApp = createInstrumentedApp({ captureProcess: true });
    instrumented = instrumentedApp;
    processCapture = instrumentedApp.processCapture ?? undefined;
    const { app, probe, tracker } = instrumentedApp;
    app.use(tracker.attachedMiddleware);
    const handler = createHandler();
    const original = new Error(`partial pre-hook secret ${secret}`);
    const preErrors: unknown[] = [];
    let sendAttempts = 0;
    let postJsonCalls = 0;

    handler.preJson = function () {
      return new Promise<void>((_resolve, reject) => {
        setTimeout(() => reject(original), 10);
      });
    };
    handler.preError = function (err: unknown) {
      preErrors.push(err);
    };
    handler.postJson = function () {
      postJsonCalls += 1;
    };

    app.use((_req, res, next) => {
      const originalSend = res.send.bind(res);
      res.send = ((body: unknown) => {
        sendAttempts += 1;
        return originalSend(body);
      }) as never;
      next();
    });

    app.get(
      '/partial-then-prejson-reject',
      handler.handleResponse((_req, res) => {
        // Headers are open at dispatch; the partial write lands while the
        // async preJson is still pending, so the rejection settles after
        // headers are committed and must still give preError visibility then
        // terminate via error middleware without a second body.
        setTimeout(() => {
          try {
            res.write('partial');
          } catch {
            // Ignore write-after-abort races in the test harness.
          }
        }, 5);
        return 'apple';
      }),
    );
    probe.install();

    await request(app)
      .get('/partial-then-prejson-reject')
      .catch(() => {
        // Partial responses abort once the probe forwards the terminal error.
      });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(probe.errorMiddlewareReachedOnce).toBe(true);
    expect(preErrors).toEqual([original]);
    expect(sendAttempts).toBe(0);
    expect(postJsonCalls).toBe(0);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
    expect(processCapture?.observedUncaughtException).toBe(false);
  });
});
