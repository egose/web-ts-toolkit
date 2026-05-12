import { createHandler } from './create-handler';

const apiHandler = createHandler();

export default apiHandler;

export { createHandler } from './create-handler';
export { ErrorFormats } from './error-formats';
export { HttpResponse } from './http-response';
export { CSVResponse } from './responses/csv';
export { Response } from './responses';
export {
  Accepted,
  AlreadyReported,
  Created,
  IMUsed,
  MultiStatus,
  NoContent,
  NonAuthoritativeInfo,
  OK,
  PartialContent,
  ResetContent,
} from './responses/success';

export type * from './public-types';
