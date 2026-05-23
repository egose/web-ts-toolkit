const MODEL_BUILD_TIME_OPTION_KEYS = new Set([
  'modelName',
  'basePath',
  'parentPath',
  'idParam',
  'queryRouteSegment',
  'mutationRouteSegment',
]);

const DATA_BUILD_TIME_OPTION_KEYS = new Set(['dataName', 'basePath', 'parentPath', 'idParam', 'queryRouteSegment']);

const getRootKey = (key: string) => key.split('.')[0];

function assertMutableKey(kind: 'model' | 'data', key: string) {
  const rootKey = getRootKey(key);
  const buildTimeKeys = kind === 'model' ? MODEL_BUILD_TIME_OPTION_KEYS : DATA_BUILD_TIME_OPTION_KEYS;

  if (buildTimeKeys.has(rootKey)) {
    throw new Error(`Cannot change ${rootKey} after router construction because it is a build-time option`);
  }
}

export function assertMutableRouterOption(kind: 'model' | 'data', key: string) {
  assertMutableKey(kind, key);
}

export function assertMutableRouterOptions(kind: 'model' | 'data', options: Record<string, unknown>) {
  Object.keys(options).forEach((key) => assertMutableKey(kind, key));
}
