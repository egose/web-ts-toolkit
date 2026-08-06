import { Schema } from 'mongoose';
import sift, { Query as SiftQuery } from 'sift';
import { filter, find } from '@web-ts-toolkit/utils';

export const filterCollection = <T>(collection: T[], predicate: SiftQuery<unknown>): T[] => {
  return filter<T>(collection, sift(predicate));
};

export const findElement = <T>(collection: T[], predicate: SiftQuery<unknown>): T | undefined => {
  return find<T>(collection, sift(predicate));
};

export const matchElement = (element: unknown, predicate: SiftQuery<unknown>): boolean => {
  return sift(predicate)(element) as boolean;
};

type DocId = string | Schema.Types.ObjectId;

export const findElementById = <T>(collection: T[], id: DocId): T | undefined => {
  return findElement(collection, { _id: id });
};
