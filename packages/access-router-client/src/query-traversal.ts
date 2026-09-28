import { isPlainObject } from '@web-ts-toolkit/utils';
import { CorrelatedIncludeError, isCorrelatedIncludeDescriptor } from './correlated-brand';
import { MAX_INPUT_DEPTH, MAX_INPUT_NODES, validateBoundedInputs } from './bounded-traversal';
import { isWrappedLazyRequest } from './lazy-promise';

export const isLazyRequestLike = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && '__op' in value && '__query' in value;

export const isEscapeLiteral = (value: unknown): boolean =>
  isPlainObject(value) && Object.keys(value).length === 1 && Object.hasOwn(value, '$escape');

export type QueryContext = 'live' | 'structural';

export const isOpaqueQueryValue = (value: unknown, mode: QueryContext = 'live'): boolean =>
  isCorrelatedIncludeDescriptor(value) || isWrappedLazyRequest(value) || (mode === 'live' && isLazyRequestLike(value));

export const queryChildContext = (value: unknown, mode: QueryContext = 'live'): QueryContext =>
  mode === 'structural' || isEscapeLiteral(value) ? 'structural' : 'live';

export function validateQueryInputs(context: string, ...inputs: unknown[]): void {
  validateInputs(context, 'live', inputs);
}

export function validateQueryWireInputs(context: string, ...inputs: unknown[]): void {
  validateInputs(context, 'structural', inputs);
}

function validateInputs(context: string, mode: QueryContext, inputs: unknown[]): void {
  validateBoundedInputs(
    inputs.filter((value) => value !== undefined).map((value) => ({ value, path: 'query', context: mode })),
    // Actual wrapped requests/descriptors and exotic leaves are opaque. Never inspect
    // executors, thenables, services or transport configs through a live request.
    // $escape, however, is only *semantically* opaque: its literal data still
    // needs structural bounds before cloning or serialization. Legacy request
    // shapes are opaque only in live query positions, never in literals/wire.
    (value, mode) => !isOpaqueQueryValue(value, mode) && (Array.isArray(value) || isPlainObject(value)),
    (failure) => {
      if (failure === 'nodes') {
        throw new CorrelatedIncludeError(`${context}: query node limit ${MAX_INPUT_NODES} exceeded`);
      }
      if (failure === 'depth') {
        throw new CorrelatedIncludeError(`${context}: query depth limit ${MAX_INPUT_DEPTH} exceeded`);
      }
      throw new CorrelatedIncludeError(`${context}: query contains a cycle`);
    },
    queryChildContext,
  );
}
