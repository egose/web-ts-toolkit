import { Schema } from 'mongoose';
import sift from 'sift';
import { filter, find } from '@web-ts-toolkit/utils';

export const filterCollection = <T>(collection: T[], predicate): T[] => {
  return filter<T>(collection, sift(predicate));
};

export const findElement = <T>(collection: T[], predicate): T | undefined => {
  return find<T>(collection, sift(predicate));
};

export const matchElement = (element, predicate) => {
  return sift(predicate)(element);
};

type DocId = string | Schema.Types.ObjectId;

export const findElementById = <T>(collection: T[], id: DocId): T | undefined => {
  return findElement(collection, { _id: id });
};
