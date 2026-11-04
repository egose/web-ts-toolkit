// Historical bug observer, not a maintained acceptance test. See review.md F1.
// Optional argument: a package.json from which to resolve installed dependencies.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const fromPackage = createRequire(process.argv[2] ? path.resolve(process.argv[2]) : import.meta.url);
const { createAccessRuntime, ModelRouter } = fromPackage('@web-ts-toolkit/access-router');
const mongoose = fromPackage('mongoose');
const api = createAccessRuntime();
const model = mongoose.model('Noa05AdmissionOrderReview', new mongoose.Schema({ value: String }));
const observations = [];

function observe(label, run, events) {
  let thrown;
  try {
    run();
  } catch (error) {
    thrown = { name: error.name, message: error.message };
  }
  observations.push({ label, events: [...events], thrown });
}

function badOptions() {
  const events = [];
  const options = new Proxy(
    {},
    {
      ownKeys() {
        events.push('ownKeys');
        throw new Error('NOA-05 ownKeys sentinel');
      },
    },
  );
  return { events, options };
}

for (const entry of ['facade', 'static']) {
  const { events, options } = badOptions();
  observe(
    entry === 'facade' ? 'api.createRouter(Model, proxy)' : 'ModelRouter.fromModel(Model, proxy)',
    () => {
      if (entry === 'facade') api.createRouter(model, options);
      else ModelRouter.fromModel(model, options, api.runtime);
    },
    events,
  );
}

for (const method of ['setDefaultModelOption', 'setModelOption', 'setDataOption']) {
  const events = [];
  const key = {
    [Symbol.toPrimitive]() {
      events.push('coercion');
      throw new Error('NOA-05 key coercion sentinel');
    },
  };
  observe(
    method + '(non-string key)',
    () => {
      if (method === 'setDefaultModelOption') api.runtime[method](key, false);
      else api.runtime[method]('Noa05AdmissionOrderReview', key, false);
    },
    events,
  );
}

assert.equal(observations[0].thrown.name, 'TypeError');
assert.deepEqual(observations[0].events, []);
assert.deepEqual(observations[1].events, ['ownKeys']);
assert.equal(observations[1].thrown.message, 'NOA-05 ownKeys sentinel');
assert.deepEqual(observations[2].events, []);
assert.equal(observations[2].thrown.name, 'TypeError');
for (const observation of observations.slice(3)) {
  assert.deepEqual(observation.events, ['coercion']);
  assert.equal(observation.thrown.message, 'NOA-05 key coercion sentinel');
}
assert.deepEqual(api.getModelNames(), []);
assert.equal(api.hasModelInstance(model.modelName), false);
assert.deepEqual(api.runtime.getDataNames(), []);
mongoose.deleteModel(model.modelName);
console.log(JSON.stringify({ observations, registryPublication: false }, null, 2));
