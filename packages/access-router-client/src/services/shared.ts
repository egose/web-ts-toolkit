import { get, noop, set } from '@web-ts-toolkit/utils';
import { ResponseCallback } from '../types';
import { ResultError, ServiceError } from './service';

export const setDefaultObjectProp = (obj: object, key: string, value: unknown) => {
  if (!get(obj, key)) {
    set(obj, key, value);
  }
};

export const createResponseHandler = (
  onSuccess: ResponseCallback,
  onFailure: ResponseCallback,
  throwOnError: boolean,
) => {
  const successHandler = onSuccess ?? noop;
  const failureHandler = onFailure ?? noop;

  return <T extends { success: boolean }>(res: T, shouldThrowOnError = throwOnError) => {
    if (res.success) {
      successHandler(res);
      return res;
    }

    failureHandler(res);
    if (shouldThrowOnError) {
      throw new ServiceError(res as unknown as ResultError);
    }

    return res;
  };
};
