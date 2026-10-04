import { parentField } from '../src';
import type {
  CorrelatedReadDescriptor,
  ListModelResponse,
  Model,
  ModelRequest,
  ModelResponse,
  ModelService,
} from '../src';

interface User {
  _id?: string;
  name: string;
  role: string;
}

declare const userService: ModelService<User>;
declare const user: Model<User, User>;

const optionsOnlyList: ModelRequest<ListModelResponse<User>> = userService.list({ includeCount: true });
const shorthandList: ModelRequest<ListModelResponse<User>> = userService.list(
  { includeCount: false },
  { headers: { user: 'admin' } },
);
const fullList: ModelRequest<ListModelResponse<User>> = userService.list(
  { select: ['name'], sort: { name: -1 }, limit: 0 },
  { includeCount: true },
  { timeout: 1000 },
);
const explicitList: ModelRequest<ListModelResponse<User>> = userService.list(undefined, undefined, { timeout: 1000 });
const projectedList: ModelRequest<ListModelResponse<User, Pick<User, 'name'>>> = userService.list<Pick<User, 'name'>>({
  includeCount: true,
});
void [optionsOnlyList, shorthandList, fullList, explicitList, projectedList];
void shorthandList.exec;
void userService.list({ sort: '-name' }).exec;
void userService.list({ sort: [['name', 'desc']] }).$include('users', { filter: { name: 'test' } });
void userService.list({}).$include('users', { filter: { name: 'test' } });

const argsRead: ModelRequest<ModelResponse<User>> = userService.read('1', { select: ['name'] });
const fullRead: ModelRequest<ModelResponse<User>> = userService.read(
  '1',
  { select: ['name'] },
  { tryList: false },
  { timeout: 1000 },
);
const shortRead: ModelRequest<ModelResponse<User>> = userService.read('1', { tryList: false }, { timeout: 1000 });
const emptyRead: ModelRequest<ModelResponse<User>> = userService.read('1', {}, {}, { timeout: 1000 });
const explicitRead: ModelRequest<ModelResponse<User>> = userService.read('1', undefined, undefined, { timeout: 1000 });
const projectedRead: ModelRequest<ModelResponse<User, Pick<User, 'name'>>> = userService.read<Pick<User, 'name'>>('1', {
  select: ['name'],
});
void [argsRead, fullRead, shortRead, emptyRead, explicitRead, projectedRead];
void argsRead.exec;
void userService.read('1', { select: ['name'] }).$include('user');

const descriptor: CorrelatedReadDescriptor = userService.read(parentField('userId'), { select: ['name'] });
void descriptor.$include('user');
// @ts-expect-error a parent-reference read still returns a non-executable descriptor.
void descriptor.exec;

const argsUpdate: ModelRequest<ModelResponse<User>> = userService.update('1', { name: 'beta' }, { select: ['name'] });
const fullUpdate: ModelRequest<ModelResponse<User>> = userService.update(
  '1',
  { name: 'beta' },
  { select: ['name'] },
  { returningAll: false },
  { timeout: 1000 },
);
const shortUpdate: ModelRequest<ModelResponse<User>> = userService.update(
  '1',
  { name: 'beta' },
  { returningAll: false },
  { timeout: 1000 },
);
const emptyUpdate: ModelRequest<ModelResponse<User>> = userService.update(
  '1',
  { name: 'beta' },
  {},
  {},
  { timeout: 1000 },
);
const explicitUpdate: ModelRequest<ModelResponse<User>> = userService.update(
  '1',
  { name: 'beta' },
  undefined,
  undefined,
  { timeout: 1000 },
);
void [argsUpdate, fullUpdate, shortUpdate, emptyUpdate, explicitUpdate];
void argsUpdate.exec;

// @ts-expect-error args and options must be separate objects.
userService.list({ select: ['name'], includeCount: true });
// @ts-expect-error sort is an argument, not an execution option.
userService.list({ sort: '-name', includeCount: true });
// @ts-expect-error invalid sort directions are rejected by the public args type.
userService.list({ sort: { name: 'sideways' } });
// @ts-expect-error args and options must be separate objects.
userService.read('1', { select: ['name'], tryList: false });
// @ts-expect-error args and options must be separate objects.
userService.update('1', { name: 'beta' }, { select: ['name'], returningAll: false });
// @ts-expect-error config requires its own slot when args are present.
userService.list({ limit: 10 }, { timeout: 1000 });
// @ts-expect-error config requires its own slot when read args are present.
userService.read('1', { select: ['name'] }, { timeout: 1000 });
// @ts-expect-error config requires its own slot when update args are present.
userService.update('1', { name: 'beta' }, { select: ['name'] }, { timeout: 1000 });
// @ts-expect-error basic list accepts at most three arguments.
userService.list({}, {}, {}, {});
// @ts-expect-error basic read accepts at most four arguments.
userService.read('1', {}, {}, {}, {});
// @ts-expect-error basic update accepts at most five arguments.
userService.update('1', { name: 'beta' }, {}, {}, {}, {});

userService.count({ headers: { user: 'admin' } });

// @ts-expect-error count accepts only one request-config argument.
userService.count(undefined, { headers: { user: 'admin' } });

user.save({ headers: { user: 'admin' } });

// @ts-expect-error save accepts only one request-config argument.
user.save(undefined, { headers: { user: 'admin' } });
