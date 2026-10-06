import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Router } from 'express';
import mongoose from 'mongoose';
import { forEach, isPlainObject, isString, isUndefined, normalizeUrlPath, padEnd } from '@web-ts-toolkit/utils';
import Model from '../model';
import { createSetCore } from '../core';
import {
  ModelRouterOptions,
  ExtendedModelRouterOptions,
  ModelRequest,
  ModelVirtualDescriptor,
  ModelVirtualGetter,
  ModelVirtualLeaf,
  ModelVirtualRecordAccess,
  RouteVariant,
} from '../interfaces';
import { logInfoMessage } from '../logger-helpers';
import type { AccessRuntime } from '../runtime';
import { defaultRuntime } from '../runtime';
import { runWithRuntime } from '../runtime-context';
import { PublicService, Service } from '../services';
import { assertMutableRouterOption, assertMutableRouterOptions } from './router-mutation';
import { accessRouterResponseHandler } from './index';
import { setModelCollectionRoutes } from './model-router-collection-routes';
import { setModelDocumentRoutes } from './model-router-document-routes';
import { setModelSubDocumentRoutes } from './model-router-subdocument-routes';
import type { RequestSchemaLike } from '../validation/types';
import type { OpenApiRouteDescriptor } from '../openapi';
import { registerOpenApiRoute } from '../openapi/route-registration';

const clientErrors = JsonRouter.clientErrors;

type SetTargetOption<TRouter, TOption> = {
  (option: TOption): TRouter;
  (key: string, option: unknown): TRouter;
};

function setOption<TModel, TVirtuals extends object = Record<never, never>>(
  this: ModelRouter<TModel, TVirtuals>,
  parentKey: string,
  optionKey: unknown,
  option?: unknown,
) {
  const key = isUndefined(option) ? parentKey : `${parentKey}.${optionKey}`;
  const value = isUndefined(option) ? optionKey : option;

  assertMutableRouterOption('model', key);
  this.runtime.setModelOption(
    this.modelName,
    key as keyof ExtendedModelRouterOptions<TModel, TVirtuals>,
    value as never,
  );
  return this;
}

export class ModelRouter<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  readonly runtime: AccessRuntime;
  readonly modelName: string;
  readonly router: JsonRouter;
  readonly model: Model;
  /** Frozen construction-time snapshot. Read current policy with runtime.getModelOptions(modelName). */
  readonly options: ModelRouterOptions<TModel, TVirtuals>;
  readonly fullBasePath: string;

  constructor(
    modelName: string,
    initialOptions: ModelRouterOptions<TModel, TVirtuals>,
    runtime: AccessRuntime = defaultRuntime,
  ) {
    this.runtime = runtime;
    this.runtime.setModelOptions(modelName, initialOptions);
    this.options = this.runtime.getModelOptions<TModel>(modelName) as ModelRouterOptions<TModel, TVirtuals>;
    this.fullBasePath = normalizeUrlPath(this.options.parentPath + this.options.basePath);
    this.modelName = modelName;
    this.router = new JsonRouter(this.options.basePath, createSetCore(this.runtime), accessRouterResponseHandler);
    this.model = new Model(modelName, this.runtime);

    this.setCollectionRoutes();
    this.setDocumentRoutes();
    this.setSubDocumentRoutes();
    this.logEndpoints();
  }

  static fromModel<TModel, TVirtuals extends object = Record<never, never>>(
    model: mongoose.Model<TModel>,
    initialOptions: ModelRouterOptions<TModel, TVirtuals>,
    runtime: AccessRuntime = defaultRuntime,
  ): ModelRouter<TModel, TVirtuals> {
    const modelName = String(model.modelName);
    runtime.registerModelInstance(modelName, model);
    return new ModelRouter<TModel, TVirtuals>(modelName, initialOptions, runtime);
  }

  private getRequestSchema(key: string) {
    return this.runtime.getExactModelOption<keyof ExtendedModelRouterOptions<TModel, TVirtuals>, TModel>(
      this.modelName,
      key as keyof ExtendedModelRouterOptions<TModel, TVirtuals>,
    ) as RequestSchemaLike | undefined;
  }

  getService(req: ModelRequest): Service<TModel, TVirtuals> {
    return req.macl.getService<TModel, TVirtuals>(this.modelName);
  }

  getPublicService(req: ModelRequest): PublicService<TModel, TVirtuals> {
    return req.macl.getPublicService<TModel, TVirtuals>(this.modelName);
  }

  private async assertAllowed(req: ModelRequest, baseAccess: string, variant?: RouteVariant) {
    const allowed =
      variant === undefined
        ? await req.macl.isAllowed(this.modelName, baseAccess)
        : await req.macl.isAllowedRoute(this.modelName, baseAccess, variant);
    if (!allowed) throw new clientErrors.UnauthorizedError();
  }

  private registerOpenApiRoute(route: OpenApiRouteDescriptor) {
    registerOpenApiRoute(this.runtime, this.fullBasePath, this.modelName, route);
  }

  ///////////////////////
  // Collection Routes //
  ///////////////////////
  private setCollectionRoutes() {
    setModelCollectionRoutes({
      modelName: this.modelName,
      router: this.router,
      options: this.options,
      runtime: this.runtime,
      getRequestSchema: this.getRequestSchema.bind(this),
      getPublicService: this.getPublicService.bind(this),
      assertAllowed: this.assertAllowed.bind(this),
      registerOpenApiRoute: this.registerOpenApiRoute.bind(this),
    });
  }

  /////////////////////
  // Document Routes //
  /////////////////////
  private setDocumentRoutes() {
    setModelDocumentRoutes({
      modelName: this.modelName,
      router: this.router,
      options: this.options,
      runtime: this.runtime,
      getRequestSchema: this.getRequestSchema.bind(this),
      getPublicService: this.getPublicService.bind(this),
      assertAllowed: this.assertAllowed.bind(this),
      registerOpenApiRoute: this.registerOpenApiRoute.bind(this),
    });
  }

  /////////////////////////
  // Sub-Document Routes //
  /////////////////////////
  private setSubDocumentRoutes() {
    setModelSubDocumentRoutes({
      modelName: this.modelName,
      router: this.router,
      options: this.options,
      runtime: this.runtime,
      getRequestSchema: this.getRequestSchema.bind(this),
      getPublicService: this.getPublicService.bind(this),
      assertAllowed: this.assertAllowed.bind(this),
      registerOpenApiRoute: this.registerOpenApiRoute.bind(this),
    });
  }

  private logEndpoints() {
    runWithRuntime(this.runtime, () => {
      forEach(this.router.getEndpoints(), ({ method, path }) => {
        logInfoMessage(`${padEnd(method, 6)} ${normalizeUrlPath(this.options.parentPath + path)}`);
      });
    });
  }

  /**
   * Update live behavior with a typed key/path or an options object. Dotted paths
   * such as `operationAccess.basicRead` update one key; object assignment replaces
   * supplied top-level values shallowly. The construction-time options snapshot stays fixed.
   */
  set<K extends Extract<keyof TVirtuals, string> & string, A extends ModelVirtualRecordAccess>(
    key: `virtuals.${K}.${A}`,
    value:
      | ModelVirtualDescriptor<TModel, K extends keyof TVirtuals ? TVirtuals[K] : unknown>
      | ModelVirtualGetter<TModel, K extends keyof TVirtuals ? TVirtuals[K] : unknown>,
  ): this;
  set<K extends Extract<keyof TVirtuals, string> & string>(
    key: `virtuals.${K}`,
    value: ModelVirtualLeaf<TModel, K extends keyof TVirtuals ? TVirtuals[K] : unknown>,
  ): this;
  set<K extends keyof ExtendedModelRouterOptions<TModel, TVirtuals>>(
    key: K,
    value: ExtendedModelRouterOptions<TModel, TVirtuals>[K],
  ): this;
  set(options: ModelRouterOptions<TModel, TVirtuals>): this;
  set<K extends keyof ExtendedModelRouterOptions<TModel, TVirtuals>>(
    keyOrOptions: K | ModelRouterOptions<TModel, TVirtuals>,
    value?: unknown,
  ) {
    if (arguments.length === 2 && isString(keyOrOptions)) {
      assertMutableRouterOption('model', keyOrOptions as string);
      this.runtime.setModelOption(
        this.modelName,
        keyOrOptions as K,
        value as ExtendedModelRouterOptions<TModel, TVirtuals>[K],
      );
    }

    if (arguments.length === 1 && isPlainObject(keyOrOptions)) {
      assertMutableRouterOptions('model', keyOrOptions as Record<string, unknown>);
      this.runtime.setModelOptions<TModel, TVirtuals>(
        this.modelName,
        keyOrOptions as ModelRouterOptions<TModel, TVirtuals>,
      );
    }

    return this;
  }

  /** Set one live option/path; `setOption('operationAccess.basicRead', undefined)` restores inheritance. */
  setOption<K extends keyof ExtendedModelRouterOptions<TModel, TVirtuals>>(
    key: K,
    option: ExtendedModelRouterOptions<TModel, TVirtuals>[K],
  ) {
    assertMutableRouterOption('model', key as string);
    this.runtime.setModelOption(this.modelName, key, option as never);
    return this;
  }

  /** Shallowly replace supplied top-level options; an operationAccess object replaces that entire rule object. */
  setOptions(options: ModelRouterOptions<TModel, TVirtuals>) {
    assertMutableRouterOptions('model', options as Record<string, unknown>);
    this.runtime.setModelOptions<TModel, TVirtuals>(this.modelName, options);
    return this;
  }

  /**
   * The maximum limit of the number of documents returned from the `list` operation.
   */
  public listHardLimit: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['listHardLimit']
  > = setOption.bind(this, 'listHardLimit');

  /**
   * The object schema to define the access control policy for each model field.
   * Virtual permission keys (`fullAddress`, etc.) are typed via `TVirtuals`.
   * Basic/advanced route guards belong to operationAccess, not field-rule objects.
   */
  public permissionSchema: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['permissionSchema']
  > = setOption.bind(this, 'permissionSchema');

  /**
   * Package-level computed fields (VIRT-01, VIRT-00A D1-D8).
   * Mutable post-construction (not a build-time key). Supports
   * `virtuals({...})`, `virtuals(name, descriptor)`, and dotted
   * `set('virtuals.<name>.<access>', descriptor)` forms. Exact →
   * `.default` → bare resolution applies; inapplicable registered names stay
   * virtual. Configuration is validated before commit against the receiving
   * Mongoose schema + child scopes, protected permission-field overlaps,
   * `_id`/reserved paths, and dotted names; rejected mutations preserve the
   * previous valid configuration.
   *
   * Reachable from the root (`@web-ts-toolkit/access-router`) and the
   * existing `./advanced` interface barrel; no new subpaths. Selected
   * virtual outputs are optional (`Partial`) because authorization, absent
   * dependencies, `undefined`, and fail-closed errors can omit them.
   *
   * @example Shortest typed happy-path (persisted model lacks `fullAddress`):
   * ```ts
   * import acl from '@web-ts-toolkit/access-router';
   * interface User { name: string; address: string; }
   * interface UserVirtuals { fullAddress: string; }
   * const router = acl.createRouter<User, UserVirtuals>('User', {
   *   permissionSchema: {
   *     name: { read: true },
   *     address: { read: 'canViewAddress' },
   *     fullAddress: { read: 'canViewAddress' },
   *   },
   *   virtuals: {
   *     fullAddress: {
   *       dependsOn: ['address'],
   *       read: async function (doc) {
   *         if (doc.address === undefined) return undefined;
   *         return `addr:${doc.address}`;
   *       },
   *     },
   *   },
   * });
   * router.virtuals({
   *   fullAddress: {
   *     dependsOn: ['address'],
   *     read: async function (doc) {
   *       if (doc.address === undefined) return undefined;
   *       return `addr:${doc.address}`;
   *     },
   *   },
   * });
   * router.set('virtuals.fullAddress.read', {
   *   get: async function (doc) {
   *     if (doc.address === undefined) return undefined;
   *     return `addr:${doc.address}`;
   *   },
   *   dependsOn: ['address'],
   * });
   * void router;
   * ```
   */
  public virtuals: SetTargetOption<ModelRouter<TModel, TVirtuals>, ModelRouterOptions<TModel, TVirtuals>['virtuals']> =
    setOption.bind(this, 'virtuals');

  /**
   * The object field to store the document permissions.
   */
  public documentPermissionField: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['documentPermissionField']
  > = setOption.bind(this, 'documentPermissionField');

  /**
   * The model fields always selected for ACL and response shaping.
   */
  public alwaysSelectFields: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['alwaysSelectFields']
  > = setOption.bind(this, 'alwaysSelectFields');

  /**
   * The function called in the process of generating document permissions.
   */
  public docPermissions: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['docPermissions']
  > = setOption.bind(this, 'docPermissions');

  /**
   * Configure live base and basic/advanced route guards. Only undefined inherits;
   * selected false denies with HTTP 401 without removing routes or OpenAPI entries.
   * `operationAccess('basicRead', false)` updates one key, and
   * `operationAccess('subs.comments.basicRead', false)` updates a field-specific key.
   * `operationAccess({ list: true, read: true })` replaces the whole rule object,
   * not a deep merge. Use setOption with undefined to restore variant inheritance.
   */
  public operationAccess: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['operationAccess']
  > = setOption.bind(this, 'operationAccess');

  /**
   * The base filter definitions applied in every query transaction.
   * @operation `list`, `read`, `update`, `delete`
   */
  public baseFilter: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['baseFilter']
  > = setOption.bind(this, 'baseFilter');

  /**
   * Trusted filter replacements applied before base-filter composition.
   * They may replace ordinary filters, but cannot replace an existing `false` denial.
   * Returning `false` denies the transaction.
   * @operation `list`, `read`, `update`, `delete`
   */
  public overrideFilter: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['overrideFilter']
  > = setOption.bind(this, 'overrideFilter');

  /**
   * Hook
   *
   * The function called before a new/update document data is processed in `prepare` hooks. This method is used to validate `write data` and throw an error if not valid.
   * @operation `create`, `update`
   */
  public validate: SetTargetOption<ModelRouter<TModel, TVirtuals>, ModelRouterOptions<TModel, TVirtuals>['validate']> =
    setOption.bind(this, 'validate');

  /**
   * Hook
   *
   * The function called before a new document is created or an existing document is updated. This method is used to process raw data passed into the API endpoints.
   * @operation `create`, `update`
   */
  public prepare: SetTargetOption<ModelRouter<TModel, TVirtuals>, ModelRouterOptions<TModel, TVirtuals>['prepare']> =
    setOption.bind(this, 'prepare');

  /**
   * Hook
   *
   * The function called before an updated document is saved.
   * @operation `update`
   */
  public transform: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['transform']
  > = setOption.bind(this, 'transform');

  /**
   * Hook
   *
   * The function called after a new document is created or an updated document is saved.
   * @operation `create`, `update`
   */
  public afterPersist: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['afterPersist']
  > = setOption.bind(this, 'afterPersist');

  /**
   * Hook
   *
   * The function called after an updated document changes have been finalized.
   * @operation `update`
   */
  public onChange: SetTargetOption<ModelRouter<TModel, TVirtuals>, ModelRouterOptions<TModel, TVirtuals>['onChange']> =
    setOption.bind(this, 'onChange');

  /**
   * Hook
   *
   * The function called before a document is deleted.
   * @operation `delete`
   */
  public beforeDelete: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['beforeDelete']
  > = setOption.bind(this, 'beforeDelete');

  /**
   * Hook
   *
   * The function called after a document is deleted.
   * @operation `delete`
   */
  public afterDelete: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['afterDelete']
  > = setOption.bind(this, 'afterDelete');

  /**
   * Hook
   *
   * The function called before response data is sent. This method is used to process raw data to apply custom logic before sending the result.
   * @operation `list`, `read`, `create`, `update`
   */
  public decorate: SetTargetOption<ModelRouter<TModel, TVirtuals>, ModelRouterOptions<TModel, TVirtuals>['decorate']> =
    setOption.bind(this, 'decorate');

  /**
   * Hook
   *
   * The functions are called before response data is sent and after `decorate` hooks run. This method is used to process and filter multiple document objects before sending the result.
   * @operation `list`
   */
  public decorateAll: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['decorateAll']
  > = setOption.bind(this, 'decorateAll');

  /**
   * The field matched against the `id` route param.
   * @operation `read`, `update`, `delete`
   */
  public idField: SetTargetOption<ModelRouter<TModel, TVirtuals>, ModelRouterOptions<TModel, TVirtuals>['idField']> =
    setOption.bind(this, 'idField');

  /**
   * The function used to resolve the `id` route param into a document filter.
   * @operation `read`, `update`, `delete`
   */
  public resolveIdFilter: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['resolveIdFilter']
  > = setOption.bind(this, 'resolveIdFilter');

  /**
   * The route segment used for advanced query endpoints.
   */
  public queryRouteSegment: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['queryRouteSegment']
  > = setOption.bind(this, 'queryRouteSegment');

  /**
   * The route segment used for advanced mutation endpoints.
   */
  public mutationRouteSegment: SetTargetOption<
    ModelRouter<TModel, TVirtuals>,
    ModelRouterOptions<TModel, TVirtuals>['mutationRouteSegment']
  > = setOption.bind(this, 'mutationRouteSegment');

  /**
   * The default values used when missing in the operations.
   */
  public defaults: SetTargetOption<ModelRouter<TModel, TVirtuals>, ModelRouterOptions<TModel, TVirtuals>['defaults']> =
    setOption.bind(this, 'defaults');

  get routes(): Router {
    return this.router.original;
  }
}
