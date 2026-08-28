import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import { Module, Router, RouterOptions, Validate, Document, EgoseFactoryStatic } from '../src';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';
import { cleanupConsumerDirs, packageRoot, runTsc, stageConsumerDir, workspaceRoot } from './consumer-stage';

type DocumentedExample = {
  name: string;
  source: string;
};

const docs = [
  {
    name: 'README quick start',
    path: path.join(packageRoot, 'README.md'),
  },
  {
    name: 'website quick start',
    path: path.join(workspaceRoot, 'website', 'docs', 'packages', 'access-router-deco.md'),
  },
];

function extractFirstTypeScriptBlock(name: string, filePath: string): DocumentedExample {
  const contents = readFileSync(filePath, 'utf8');
  const match = contents.match(/```ts\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`Missing TypeScript block in ${filePath}`);
  return { name, source: match[1] };
}

describe('access-router-deco documentation examples', () => {
  let consumerDir: string;

  beforeAll(() => {
    consumerDir = stageConsumerDir();
  });

  afterAll(() => {
    cleanupConsumerDirs();
  });

  it.each(docs.map((doc) => extractFirstTypeScriptBlock(doc.name, doc.path)))(
    'compiles $name against emitted declarations',
    ({ name, source }) => {
      const sourceFile = path.resolve(consumerDir, `${name.toLowerCase().replaceAll(/\W+/g, '-')}.ts`);
      const tsconfigPath = path.resolve(consumerDir, `${name.toLowerCase().replaceAll(/\W+/g, '-')}.tsconfig.json`);

      writeFileSync(sourceFile, source);
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
              esModuleInterop: true,
              types: ['node', 'reflect-metadata'],
              lib: ['ES2022', 'DOM'],
            },
            include: [path.basename(sourceFile)],
          },
          null,
          2,
        ),
      );

      const result = runTsc(consumerDir, tsconfigPath);

      if (result.status !== 0) {
        throw new Error(
          `${name} failed to compile against access-router-deco package declarations:\n${result.stdout}${result.stderr}`,
        );
      }

      expect(result.status).toBe(0);
    },
  );

  it('rejects returning document from typed validator at type-check time', () => {
    const sourceFile = path.resolve(consumerDir, 'validate-return-doc-fail.ts');
    const tsconfigPath = path.resolve(consumerDir, 'validate-return-doc-fail.tsconfig.json');

    writeFileSync(
      sourceFile,
      `
        import 'reflect-metadata';
        import { Router, Validate, Document } from '@web-ts-toolkit/access-router-deco';

        type UserDoc = { name: string; email: string };

        class BadValidator {
          @Validate('create')
          validateCreate(@Document() doc: UserDoc) {
            // Should fail: returning the document is outside ValidateRule (boolean | unknown[])
            return doc;
          }
        }
        void BadValidator;
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
          include: ['validate-return-doc-fail.ts'],
        },
        null,
        2,
      ),
    );

    const result = runTsc(consumerDir, tsconfigPath);
    // Without @ts-expect-error this must fail — proves strict consumer catches document return
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/error TS/);
  });

  it('executes documented @Validate contract at runtime (true / false / issue array)', async () => {
    type Doc = { name?: string; email?: string };
    const modelName = `DocExampleUser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (!mongoose.models[modelName]) {
      mongoose.model(modelName, new mongoose.Schema({ name: String, email: String }));
    }

    class DocExampleUserRouter {
      validateCreate(doc: Doc) {
        if (!doc.email) return ['email is required'];
        if (!doc.name) return false;
        return true;
      }

      validateUpdate(doc: Doc) {
        if (!doc.email && !doc.name) return ['at least one field required'];
        return true;
      }
    }
    Router(modelName, { basePath: '/doc-users' })(DocExampleUserRouter);
    applyMethodDecorator(Validate('create'), DocExampleUserRouter.prototype, 'validateCreate');
    applyParameterDecorator(Document(), DocExampleUserRouter.prototype, 'validateCreate', 0);
    applyMethodDecorator(Validate('update'), DocExampleUserRouter.prototype, 'validateUpdate');
    applyParameterDecorator(Document(), DocExampleUserRouter.prototype, 'validateUpdate', 0);

    class DefaultOpts {}
    RouterOptions({
      operationAccess: { create: true, update: true, read: true, list: true },
    })(DefaultOpts);

    class DocValidateModule {}
    Module({
      routers: [DocExampleUserRouter],
      routerOptions: [DefaultOpts],
      options: { basePath: '/api-doc-validate' },
    })(DocValidateModule);

    const runtime = createAccessRuntime();
    const factory = EgoseFactoryStatic.create(runtime);
    const app = express();
    factory.bootstrap(DocValidateModule, app);

    const validateCreate = runtime.getModelOption(modelName, 'validate.create' as never) as (
      doc: Doc,
      perms?: unknown,
      ctx?: unknown,
    ) => unknown;
    const validateUpdate = runtime.getModelOption(modelName, 'validate.update' as never) as (
      doc: Doc,
      perms?: unknown,
      ctx?: unknown,
    ) => unknown;

    expect(typeof validateCreate).toBe('function');
    expect(typeof validateUpdate).toBe('function');

    // valid input passes
    expect(await (validateCreate as any).call({}, { email: 'a@b.co', name: 'Ada' })).toBe(true);
    // missing email -> issue array (controlled validation failure)
    const missingEmail = await (validateCreate as any).call({}, { name: 'Ada' });
    expect(Array.isArray(missingEmail)).toBe(true);
    expect(missingEmail).toContain('email is required');
    // missing name -> false (controlled failure)
    expect(await (validateCreate as any).call({}, { email: 'a@b.co' })).toBe(false);
    // update with no fields -> issue array
    const missingBoth = await (validateUpdate as any).call({}, {});
    expect(Array.isArray(missingBoth)).toBe(true);
    // update valid
    expect(await (validateUpdate as any).call({}, { email: 'a@b.co' })).toBe(true);

    // Verify that throwing is NOT the documented pattern — the hook returns controlled values instead
    // (service layer maps false/issue-array to 400; throw would be 500 sanitized)
  });
});
