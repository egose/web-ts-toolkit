import {
  Connection,
  Schema,
  type HydratedDocument,
  type Model,
  type UpdateResult,
} from '@web-ts-toolkit/mongoose-rxdb';

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

interface UserStatics {
  adults(): Promise<Array<HydratedDocument<User, UserMethods, UserVirtuals>>>;
}

type UserModel = Model<User, UserMethods, UserStatics, UserVirtuals>;

const schema = new Schema<User, UserMethods, UserStatics, UserVirtuals>({ name: String, age: Number, tags: [String] });
schema.method('addTag', function (tag) {
  this.tags.push(tag);
  return this.tags;
});
schema.virtual('isAdult').get(function () {
  return this.age >= 18;
});
schema.static('adults', function (this: UserModel) {
  return this.find({ age: { $gte: 18 } });
});

const conn = new Connection();
const User: UserModel = conn.model('BundlerTsUser', schema);

async function typedModelProbe() {
  const created = await User.create({ name: 'Ada', age: 36, tags: [] });
  const users = await User.find({ tags: { $in: ['math'] } });
  const leanOne = await User.findOne({ name: 'Ada' }).lean(true);
  const update: UpdateResult = await User.updateMany({ age: { $gte: 18 } }, { $addToSet: { tags: 'math' } });
  const adults = await User.adults();
  created.addTag('history');
  // @ts-expect-error misspelled fields are rejected.
  User.findOne({ nmae: 'Ada' });
  // @ts-expect-error numeric operators require compatible field values.
  User.updateOne({ name: 'Ada' }, { $inc: { tags: 1 } });
  // @ts-expect-error lean records do not expose document methods.
  leanOne?.save();
  // @ts-expect-error connection strings are not supported.
  conn.connect('mongodb://example.invalid');
  return [users, leanOne, update, adults];
}

void [User, typedModelProbe];
