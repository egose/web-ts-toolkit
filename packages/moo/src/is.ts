import { Types } from 'mongoose';

const { ObjectId } = Types;

export function isObjectId(value: unknown): value is InstanceType<typeof ObjectId> | string {
  if (!ObjectId.isValid(value as Parameters<typeof ObjectId.isValid>[0])) {
    return false;
  }

  try {
    const asString = String(value);
    const asObjectId = new ObjectId(asString);
    const asStringifiedObjectId = asObjectId.toString();
    return asString === asStringifiedObjectId;
  } catch {
    return false;
  }
}
