/* eslint-disable @typescript-eslint/no-require-imports */
import api = require('@web-ts-toolkit/mongoose-rxdb');

interface User {
  name: string;
  age: number;
  tags: string[];
}

interface UserMethods {
  addTag(tag: string): string[];
}

interface UserVirtuals {
  isAdult: boolean;
}

type UserModel = api.Model<User, UserMethods, {}, UserVirtuals>;

const schema = new api.Schema<User, UserMethods, {}, UserVirtuals>({ name: String, age: Number, tags: [String] });
schema.method('addTag', function (tag) {
  this.tags.push(tag);
  return this.tags;
});
schema.virtual('isAdult').get(function () {
  return this.age >= 18;
});

const conn = new api.Connection();
const User: UserModel = conn.model('NodeNextTsUser', schema);

async function typedModelProbe() {
  const created = await User.create({ name: 'Ada', age: 36, tags: [] });
  const found = await User.find({ age: { $gte: 18 } });
  const one = await User.findOne({ name: 'Ada' });
  const lean = await User.find({ name: { $regex: /A/ } }).lean(true);
  const update: api.UpdateResult = await User.updateOne({ name: 'Ada' }, { $inc: { age: 1 }, $push: { tags: 'math' } });
  created.addTag('history');
  created.isAdult;
  one?.save();
  // @ts-expect-error misspelled fields are rejected.
  User.find({ agge: 18 });
  // @ts-expect-error regex is string-field only.
  User.find({ age: { $regex: /18/ } });
  // @ts-expect-error incompatible update values are rejected.
  User.updateOne({ name: 'Ada' }, { $set: { age: 'old' } });
  // @ts-expect-error lean results do not expose hydrated document APIs.
  lean[0].save();
  // @ts-expect-error connection strings are not supported.
  conn.connect('mongodb://example.invalid');
  return [found, lean, update];
}

void [api.Schema, User, typedModelProbe];
