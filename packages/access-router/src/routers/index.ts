export * from './model-router';
export * from './root-router';
export * from './data-router';
import JsonRouter from '@web-ts-toolkit/express-json-router';

export const accessRouterResponseHandler = JsonRouter.createHandler({
  errorFormat: JsonRouter.ErrorFormats.rfc9457,
  rfc9457ContentType: 'application/problem+json',
});

accessRouterResponseHandler.errorMessageProvider = function (error) {
  const errorLike = error as { message?: string; _message?: string };

  console.error(error);
  return errorLike.message || errorLike._message || String(error);
};
