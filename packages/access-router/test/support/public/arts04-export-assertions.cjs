// This checked-in fixture intentionally exercises actual Node CommonJS loading.
const assert = require('node:assert/strict'); // eslint-disable-line @typescript-eslint/no-require-imports

// Semantic supported names, not a snapshot of private declarations or chunk names.
module.exports = function check(root, advanced, processors) {
  assert.equal(typeof root.default, 'function');
  assert.equal(root.default, root.acl);
  for (const name of [
    'AccessRuntime',
    'RootRouter',
    'ModelRouter',
    'DataRouter',
    'createAccessRuntime',
    'createOpenApiRouter',
    'combineRoutes',
    'defineRequestSchema',
    'guard',
    'permissionsPlugin',
    'setGlobalOptions',
    'setGlobalOption',
    'getGlobalOptions',
    'getGlobalOption',
    'setModelOptions',
    'setModelOption',
    'getModelOptions',
    'getModelOption',
    'setDefaultModelOptions',
    'setDefaultModelOption',
    'getDefaultModelOptions',
    'getDefaultModelOption',
    'registerModelInstance',
    'getModelInstance',
    'hasModelInstance',
    'getModelNames',
    'getModelJsonSchema',
    'fromAjv',
    'fromArkType',
    'fromIoTs',
    'fromJoi',
    'fromStandardSchema',
    'fromSuperstruct',
    'fromValibot',
    'fromVine',
    'fromYup',
    'fromZod',
  ])
    assert.equal(typeof root[name], 'function', name);
  const api = root.createAccessRuntime();
  assert.equal(typeof api, 'function');
  assert.ok(api.runtime instanceof root.AccessRuntime);
  for (const name of [
    'parseBody',
    'parseBodyWithSchema',
    'parseNestedBodyWithSchema',
    'parseQuery',
    'parsePathParam',
  ]) {
    assert.equal(typeof advanced[name], 'function', name);
    assert.equal(name in root, false);
  }
  for (const name of ['MIDDLEWARE', 'DATA_MIDDLEWARE', 'PERMISSIONS', 'PERMISSION_KEYS'])
    assert.equal(typeof advanced[name], 'symbol');
  assert.equal(advanced.Codes.Success, 'success');
  assert.equal(advanced.parsePathParam(['first', 'second'], 'id'), 'first');
  assert.deepEqual(advanced.parseBody(advanced.listBodySchema, { select: ['name'] }), { select: ['name'] });
  for (const name of ['copyAndDepopulate', 'copyPaths', 'movePaths', 'sliceArrays', 'countPaths', 'maskPaths'])
    assert.equal(typeof processors[name], 'function');
  assert.deepEqual(processors.maskPaths({ secret: 'value' }, [{ src: 'secret' }]), { secret: '***' });
  for (const entry of [root, advanced])
    for (const name of [
      'Core',
      'DataCore',
      'Service',
      'PublicService',
      'Permission',
      'resolveServiceAuthorization',
      'createDocumentStage',
      'toPublicSingleResult',
      'createPreparedModelQuery',
    ])
      assert.equal(name in entry, false, name);
};
