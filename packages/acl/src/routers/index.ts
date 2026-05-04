export * from './model-router';
export * from './root-router';
import JsonRouter from '@web-ts-toolkit/express-json-router';

JsonRouter.errorMessageProvider = function (error) {
  const errorLike = error as { message?: string; _message?: string };

  console.error(error);
  return errorLike.message || errorLike._message || String(error);
};
