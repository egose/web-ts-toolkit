import type { Model, ModelService } from '../src';

interface User {
  _id?: string;
  name: string;
  role: string;
}

declare const userService: ModelService<User>;
declare const user: Model<User, User>;

userService.count({ headers: { user: 'admin' } });

// @ts-expect-error count accepts only one request-config argument.
userService.count(undefined, { headers: { user: 'admin' } });

user.save({ headers: { user: 'admin' } });

// @ts-expect-error save accepts only one request-config argument.
user.save(undefined, { headers: { user: 'admin' } });
