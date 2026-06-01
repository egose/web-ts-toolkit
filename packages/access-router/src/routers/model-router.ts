import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Router } from 'express';
import { forEach, isPlainObject, isString, isUndefined, normalizeUrlPath, padEnd } from '@web-ts-toolkit/utils';
import Model from '../model';
import { createSetCore } from '../core';
import { ModelRouterOptions, ExtendedModelRouterOptions, ModelRequest } from '../interfaces';
import { logger } from '../logger';
import type { AccessRuntime } from '../runtime';
import { defaultRuntime } from '../runtime';
import { attachRuntimeToModel, runWithRuntime } from '../runtime-context';
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

function setOption<TModel>(this: ModelRouter<TModel>, parentKey: string, optionKey: unknown, option?: unknown) {
  const key = isUndefined(option) ? parentKey : `${parentKey}.${optionKey}`;
  const value = isUndefined(option) ? optionKey : option;

  assertMutableRouterOption('model', key);
  this.runtime.setModelOption(this.modelName, key as keyof ExtendedModelRouterOptions<TModel>, value);
  return this;
}

export class ModelRouter<TModel = unknown> {
  readonly runtime: AccessRuntime;
  readonly modelName: string;
  readonly router: JsonRouter;
  readonly model: Model;
  readonly options: ModelRouterOptions<TModel>;
  readonly fullBasePath: string;

  constructor(modelName: string, initialOptions: ModelRouterOptions<TModel>, runtime: AccessRuntime = defaultRuntime) {
    this.runtime = runtime;
    this.runtime.setModelOptions(modelName, initialOptions);
    attachRuntimeToModel(modelName, this.runtime);
    this.options = this.runtime.getModelOptions<TModel>(modelName);
    this.fullBasePath = normalizeUrlPath(this.options.parentPath + this.options.basePath);
    this.modelName = modelName;
    this.router = new JsonRouter(this.options.basePath, createSetCore(this.runtime), accessRouterResponseHandler);
    this.model = new Model(modelName);

    this.setCollectionRoutes();
    this.setDocumentRoutes();
    this.setSubDocumentRoutes();
    this.logEndpoints();
  }

  private getRequestSchema(key: string) {
    return this.runtime.getExactModelOption<keyof ExtendedModelRouterOptions<TModel>, TModel>(
      this.modelName,
      key as keyof ExtendedModelRouterOptions<TModel>,
    ) as RequestSchemaLike | undefined;
  }

  getService(req: ModelRequest): Service<TModel> {
    return req.macl.getService<TModel>(this.modelName);
  }

  getPublicService(req: ModelRequest): PublicService<TModel> {
    return req.macl.getPublicService<TModel>(this.modelName);
  }

  private async assertAllowed(req: ModelRequest, access: string) {
    const allowed = await req.macl.isAllowed(this.modelName, access);
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
      getRequestSchema: this.getRequestSchema.bind(this),
      getPublicService: this.getPublicService.bind(this),
      assertAllowed: this.assertAllowed.bind(this),
      registerOpenApiRoute: this.registerOpenApiRoute.bind(this),
    });
  }

  private logEndpoints() {
    runWithRuntime(this.runtime, () => {
      forEach(this.router.endpoints, ({ method, path }) => {
        logger.info(`${padEnd(method, 6)} ${normalizeUrlPath(this.options.parentPath + path)}`);
      });
    });
  }

  set<K extends keyof ExtendedModelRouterOptions<TModel>>(key: K, value: ExtendedModelRouterOptions<TModel>[K]): this;
  set(options: ModelRouterOptions<TModel>): this;
  set<K extends keyof ExtendedModelRouterOptions<TModel>>(
    keyOrOptions: K | ModelRouterOptions<TModel>,
    value?: unknown,
  ) {
    if (arguments.length === 2 && isString(keyOrOptions)) {
      assertMutableRouterOption('model', keyOrOptions as string);
      this.runtime.setModelOption<K, TModel>(
        this.modelName,
        keyOrOptions as K,
        value as ExtendedModelRouterOptions<TModel>[K],
      );
    }

    if (arguments.length === 1 && isPlainObject(keyOrOptions)) {
      assertMutableRouterOptions('model', keyOrOptions as Record<string, unknown>);
      this.runtime.setModelOptions<TModel>(this.modelName, keyOrOptions as ModelRouterOptions<TModel>);
    }

    return this;
  }

  setOption<K extends keyof ExtendedModelRouterOptions<TModel>>(key: K, option: ExtendedModelRouterOptions<TModel>[K]) {
    assertMutableRouterOption('model', key as string);
    this.runtime.setModelOption<K, TModel>(this.modelName, key, option);
    return this;
  }

  setOptions(options: ModelRouterOptions<TModel>) {
    assertMutableRouterOptions('model', options as Record<string, unknown>);
    this.runtime.setModelOptions<TModel>(this.modelName, options);
    return this;
  }

  /**
   * The maximum limit of the number of documents returned from the `list` operation.
   */
  public listHardLimit: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['listHardLimit']> =
    setOption.bind(this, 'listHardLimit');

  /**
   * The object schema to define the access control policy for each model field.
   */
  public permissionSchema: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['permissionSchema']> =
    setOption.bind(this, 'permissionSchema');

  /**
   * The object field to store the document permissions.
   */
  public documentPermissionField: SetTargetOption<
    ModelRouter<TModel>,
    ModelRouterOptions<TModel>['documentPermissionField']
  > = setOption.bind(this, 'documentPermissionField');

  /**
   * The model fields always selected for ACL and response shaping.
   */
  public alwaysSelectFields: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['alwaysSelectFields']> =
    setOption.bind(this, 'alwaysSelectFields');

  /**
   * The function called in the process of generating document permissions.
   */
  public docPermissions: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['docPermissions']> =
    setOption.bind(this, 'docPermissions');

  /**
   * The access control policy for router operations.
   * @operation `create`, `list`, `read`, `update`, `delete`
   */
  public operationAccess: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['operationAccess']> =
    setOption.bind(this, 'operationAccess');

  /**
   * The base filter definitions applied in every query transaction.
   * @operation `list`, `read`, `update`, `delete`
   */
  public baseFilter: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['baseFilter']> = setOption.bind(
    this,
    'baseFilter',
  );

  /**
   * The override filter definitions applied in every query transaction.
   * @operation `list`, `read`, `update`, `delete`
   */
  public overrideFilter: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['overrideFilter']> =
    setOption.bind(this, 'overrideFilter');

  /**
   * Hook
   *
   * The function called before a new/update document data is processed in `prepare` hooks. This method is used to validate `write data` and throw an error if not valid.
   * @operation `create`, `update`
   */
  public validate: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['validate']> = setOption.bind(
    this,
    'validate',
  );

  /**
   * Hook
   *
   * The function called before a new document is created or an existing document is updated. This method is used to process raw data passed into the API endpoints.
   * @operation `create`, `update`
   */
  public prepare: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['prepare']> = setOption.bind(
    this,
    'prepare',
  );

  /**
   * Hook
   *
   * The function called before an updated document is saved.
   * @operation `update`
   */
  public transform: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['transform']> = setOption.bind(
    this,
    'transform',
  );

  /**
   * Hook
   *
   * The function called after a new document is created or an updated document is saved.
   * @operation `create`, `update`
   */
  public afterPersist: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['afterPersist']> =
    setOption.bind(this, 'afterPersist');

  /**
   * Hook
   *
   * The function called after an updated document changes have been finalized.
   * @operation `update`
   */
  public onChange: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['onChange']> = setOption.bind(
    this,
    'onChange',
  );

  /**
   * Hook
   *
   * The function called before a document is deleted.
   * @operation `delete`
   */
  public beforeDelete: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['beforeDelete']> =
    setOption.bind(this, 'beforeDelete');

  /**
   * Hook
   *
   * The function called after a document is deleted.
   * @operation `delete`
   */
  public afterDelete: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['afterDelete']> = setOption.bind(
    this,
    'afterDelete',
  );

  /**
   * Hook
   *
   * The function called before response data is sent. This method is used to process raw data to apply custom logic before sending the result.
   * @operation `list`, `read`, `create`, `update`
   */
  public decorate: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['decorate']> = setOption.bind(
    this,
    'decorate',
  );

  /**
   * Hook
   *
   * The functions are called before response data is sent and after `decorate` hooks run. This method is used to process and filter multiple document objects before sending the result.
   * @operation `list`
   */
  public decorateAll: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['decorateAll']> = setOption.bind(
    this,
    'decorateAll',
  );

  /**
   * The field matched against the `id` route param.
   * @operation `read`, `update`, `delete`
   */
  public idField: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['idField']> = setOption.bind(
    this,
    'idField',
  );

  /**
   * The function used to resolve the `id` route param into a document filter.
   * @operation `read`, `update`, `delete`
   */
  public resolveIdFilter: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['resolveIdFilter']> =
    setOption.bind(this, 'resolveIdFilter');

  /**
   * The route segment used for advanced query endpoints.
   */
  public queryRouteSegment: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['queryRouteSegment']> =
    setOption.bind(this, 'queryRouteSegment');

  /**
   * The route segment used for advanced mutation endpoints.
   */
  public mutationRouteSegment: SetTargetOption<
    ModelRouter<TModel>,
    ModelRouterOptions<TModel>['mutationRouteSegment']
  > = setOption.bind(this, 'mutationRouteSegment');

  /**
   * The default values used when missing in the operations.
   */
  public defaults: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['defaults']> = setOption.bind(
    this,
    'defaults',
  );

  get routes(): Router {
    return this.router.original;
  }
}
