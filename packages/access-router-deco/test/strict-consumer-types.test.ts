import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanupConsumerDirs, runTsc, stageCleanConsumerDir, stageConsumerDir } from './consumer-stage';

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
           Validate,
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

         class InvalidValidateHooks {
           // @ts-expect-error validators must return boolean or unknown[] — returning the document is not valid
           @Validate('create')
           badReturnDocument(@Document() doc: User) {
             return doc;
           }

           // @ts-expect-error validators must return boolean or unknown[] — string is not valid
           @Validate('create')
           badString(@Document() doc: User) {
             void doc;
             return 'ok';
           }
         }

         class ValidValidateHooks {
           @Validate('create')
           okTrue(@Document() doc: User) {
             void doc;
             return true;
           }

           @Validate('create')
           okFalse(@Document() doc: User) {
             void doc;
             return false;
           }

           @Validate('create')
           okIssues(@Document() doc: User) {
             void doc;
             return ['email is required'];
           }

           @Validate('create')
           async okAsync(@Document() doc: User) {
             void doc;
             return Promise.resolve(true);
           }
         }

        class InvalidRouteGuardHooks {
          // @ts-expect-error route guards must return boolean or Promise<boolean>
          @RouteGuard('read')
          badObjectGuard() {
            return { ok: true };
          }

          // @ts-expect-error route guards must return boolean or Promise<boolean>
          @RouteGuard('read')
          badStringGuard() {
            return 'allow';
          }

          // @ts-expect-error route guards must return boolean or Promise<boolean>
          @RouteGuard('read')
          badNumberGuard() {
            return 1;
          }

          // @ts-expect-error route guards must return boolean or Promise<boolean>
          @RouteGuard('read')
          badVoidGuard() {
          }
        }

        class ValidRouteGuardHooks {
          @RouteGuard('read')
          syncTrue(@Permissions() permissions: any) {
            void permissions;
            return true;
          }

          @RouteGuard('read')
          syncFalse(@Permissions() permissions: any) {
            void permissions;
            return false;
          }

          @RouteGuard('read')
          async asyncTrue(@Permissions() permissions: any) {
            void permissions;
            return Promise.resolve(true);
          }

          @RouteGuard('read')
          async asyncFalse(@Permissions() permissions: any) {
            void permissions;
            return Promise.resolve(false);
          }
        }

        void [fromString, fromModel, AppModule, GlobalOptionsFixture, InvalidHooks, InvalidRouteGuardHooks, ValidRouteGuardHooks, InvalidValidateHooks, ValidValidateHooks, Option];
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

  it('resolves Express declarations via direct dependency in a clean consumer (no unrelated @types)', () => {
    const cleanDir = stageCleanConsumerDir();
    // Verify the staged package declares @types/express as direct dependency
    const stagedPkg = JSON.parse(
      readFileSync(
        path.join(cleanDir, 'node_modules', '@web-ts-toolkit', 'access-router-deco', 'package.json'),
        'utf8',
      ),
    ) as {
      dependencies?: Record<string, string>;
    };
    expect(stagedPkg.dependencies?.['@types/express']).toBeDefined();
    // Hoisted @types/express must exist (transitive via package dependency)
    expect(existsSync(path.join(cleanDir, 'node_modules', '@types', 'express', 'index.d.ts'))).toBe(true);

    // Reuse same strict fixture but compile from clean dir
    const sourceFile = path.join(cleanDir, 'strict-clean.ts');
    const tsconfigPath = path.join(cleanDir, 'tsconfig.clean.json');
    writeFileSync(
      sourceFile,
      `
        import 'reflect-metadata';
        import express from 'express';
        import { Router, Module, type BootstrapResult, EgoseFactoryStatic } from '@web-ts-toolkit/access-router-deco';
        @Router('CleanUser', { basePath: '/clean' })
        class UserRouter {}
        @Module({ routers: [UserRouter] })
        class AppModule {}
        const app = express();
        const result: BootstrapResult = EgoseFactoryStatic.create().bootstrap(AppModule, app);
        void result;
      `,
    );
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            types: ['node', 'reflect-metadata'],
            lib: ['ES2022', 'DOM'],
          },
          include: ['strict-clean.ts'],
        },
        null,
        2,
      ),
    );

    const result = runTsc(cleanDir, tsconfigPath);
    if (result.status !== 0) {
      throw new Error(`clean consumer compile failed (ARDECO-08 @types ownership):\n${result.stdout}${result.stderr}`);
    }
    expect(result.status).toBe(0);
  });
});
