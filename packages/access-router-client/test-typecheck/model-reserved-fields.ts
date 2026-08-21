import { Model, type ModelResponse, type ModelService } from '../src';

interface CollisionDocument {
  _id?: string;
  name: string;
  save: string;
  reset: string;
  set: string;
  get: string;
  assign: string;
  toJSON: string;
}

declare const service: ModelService<CollisionDocument>;
declare const response: ModelResponse<CollisionDocument>;

const model = Model.create<CollisionDocument>(
  {
    name: 'ordinary field',
    save: 'save field',
    reset: 'reset field',
    set: 'set field',
    get: 'get field',
    assign: 'assign field',
    toJSON: 'toJSON field',
  },
  service,
);

model.name = 'ordinary direct access remains available';
model.save();
model.reset();

const saveField: string = model.get('save');
model.set('save', 'updated save field');
model.assign({ reset: 'updated reset field' });

// @ts-expect-error collided data fields are reserved for Model methods on direct property access.
const directSaveField: string = model.save;

// @ts-expect-error collided data fields are reserved for Model methods on direct property access.
const directResetField: string = model.reset;

if (response.success) {
  response.data.save();
  const responseSaveField: string = response.data.get('save');
  response.data.set('toJSON', 'updated response field');

  // @ts-expect-error response data also reserves collided direct property names.
  const directResponseSaveField: string = response.data.save;

  // @ts-expect-error response data also reserves collided direct property names.
  const directResponseToJsonField: string = response.data.toJSON;
}

void saveField;
