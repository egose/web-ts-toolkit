import { httpErrorStatusDefinitions, type DefinedHttpErrorStatusCode } from './status-definitions';

export const messages = Object.freeze(
  Object.fromEntries(
    Object.values(httpErrorStatusDefinitions).map(({ statusCode, message }) => [statusCode, message]),
  ) as Record<DefinedHttpErrorStatusCode, string>,
);

export type ErrorMessageMap = typeof messages;
export type ErrorStatusCode = keyof ErrorMessageMap;

export const getDefaultMessage = (statusCode: number): string =>
  messages[statusCode as ErrorStatusCode] || messages[500];
