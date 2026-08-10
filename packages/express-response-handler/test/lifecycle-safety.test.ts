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
});
