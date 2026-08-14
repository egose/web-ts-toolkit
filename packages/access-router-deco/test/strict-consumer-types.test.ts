import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanupConsumerDirs, runTsc, stageConsumerDir } from './consumer-stage';

afterAll(() => {
  cleanupConsumerDirs();
});

describe('access-router-deco strict consumer types', () => {
  let consumerDir: string;

  beforeAll(() => {
    consumerDir = stageConsumerDir();
  });

  it('compiles public Router and RouterOptions model-instance overloads', () => {
    const sourceFile = path.resolve(consumerDir, 'strict-consumer.ts');
    const tsconfigPath = path.resolve(consumerDir, 'tsconfig.strict-consumer.json');

    writeFileSync(
      sourceFile,
      `
        import 'reflect-metadata';
        import mongoose, { type Model } from 'mongoose';
        import {
          BaseFilter,
          DefaultModelOption,
          Decorate,
          Document,
          GlobalOption,
          GlobalPermissions,
          Module,
          ModelOption,
          Option,
          Permissions,
          RouteGuard,
          Router,
          RouterOptions,
          type ModuleMetadata,
          type RouteGuardOperationKey,
          type RouterModel,
        } from '@web-ts-toolkit/access-router-deco';

        type User = { name: string };

        const userModel = mongoose.model<User>('StrictDecoUser', new mongoose.Schema<User>({ name: String }));

        class UserRouter {
          @ModelOption('listHardLimit')
          limit = 10;

          @BaseFilter('list')
          baseFilter(@Permissions() permissions: Record<string, boolean>) {
            void permissions;
            return true;
          }

          @Decorate<User>('read')
          decorate(@Document() doc: User) {
            return doc;
          }
        }
        Router('StrictDecoUser', { basePath: '/by-name' })(UserRouter);
        Router(userModel, { basePath: '/by-instance' })(UserRouter);

        class UserOptions {
          @DefaultModelOption('idParam')
          idParam = 'userId';
        }
        RouterOptions('StrictDecoUser', { idParam: 'userId' })(UserOptions);
        RouterOptions(userModel, { queryRouteSegment: 'search' })(UserOptions);

        class GlobalOptionsFixture {
          @GlobalOption('requestPermissionField')
          field = 'permissions';

          @GlobalPermissions()
          permissions() {
            return ['admin'];
          }
        }

        const fromString: RouterModel = 'StrictDecoUser';
        const fromModel: RouterModel = userModel as Model<unknown>;
        const routeGuardOperation: RouteGuardOperationKey = 'upsert';
        const metadata: ModuleMetadata = { routers: [UserRouter], routerOptions: [UserOptions] };
        class AppModule {}
        Module(metadata)(AppModule);
        RouteGuard('new');
        RouteGuard('upsert');
        RouteGuard('distinct');
        RouteGuard('count');
        RouteGuard(routeGuardOperation);

        // @ts-expect-error nested subroute policy stays in typed options, not scalar decorators
        RouteGuard('subs');

        // @ts-expect-error model overload requires a Mongoose model, not a model-like object
        Router({ modelName: 'StrictDecoUser' }, {});

        // @ts-expect-error model-specific options require a model name or Mongoose model
        RouterOptions(123, {});

        // @ts-expect-error bootstrapped classes must be directly zero-argument constructable
        Module({ routers: [class NeedsConstructor { constructor(readonly value: string) {} }] });

        // @ts-expect-error use scoped option decorators for typed public option keys
        ModelOption('requestPermissionField');

        // @ts-expect-error default model options do not include model-specific base paths
        DefaultModelOption('basePath');

        // @ts-expect-error global options do not include model router options
        GlobalOption('listHardLimit');

        class InvalidHooks {
          // @ts-expect-error base filters must return an access-router filter, true, null, undefined, or a promise
          @BaseFilter('read')
          badBaseFilter() {
            return 123;
          }

          // @ts-expect-error decorate hooks must return the decorated document type
          @Decorate<User>('read')
          badDecorate(@Document() doc: User) {
            void doc;
            return 'wrong';
          }
        }

        void [fromString, fromModel, AppModule, GlobalOptionsFixture, InvalidHooks, Option];
      `,
    );
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            types: ['node', 'reflect-metadata'],
            lib: ['ES2022', 'DOM'],
          },
          include: ['strict-consumer.ts'],
        },
        null,
        2,
      ),
    );

    const result = runTsc(consumerDir, tsconfigPath);

    if (result.status !== 0) {
      throw new Error(`access-router-deco strict consumer compile failed:\n${result.stdout}${result.stderr}`);
    }

    expect(result.status).toBe(0);
  });
});
