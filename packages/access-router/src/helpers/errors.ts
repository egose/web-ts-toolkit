import JsonRouter from '@web-ts-toolkit/express-json-router';
import { Codes, StatusCodes } from '../enums';
import { ErrorResult, ServiceResult } from '../interfaces';

const { BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } = JsonRouter.clientErrors;

export function mapCodeToMessage(code: string) {
  switch (code) {
    case Codes.Success:
      return 'OK';
    case Codes.Created:
      return 'Created';
    case Codes.BadRequest:
      return 'Bad Request';
    case Codes.Forbidden:
      return 'Forbidden';
    case Codes.NotFound:
      return 'Not Found';
    default:
      return;
  }
}

export function mapCodeToStatusCode(code: string) {
  switch (code) {
    case Codes.Success:
      return StatusCodes.OK;
    case Codes.Created:
      return StatusCodes.Created;
    case Codes.BadRequest:
      return StatusCodes.BadRequest;
    case Codes.Forbidden:
      return StatusCodes.Forbidden;
    case Codes.NotFound:
      return StatusCodes.NotFound;
    default:
      return StatusCodes.UnprocessableContent;
  }
}

export function handleResultError<T>(
  result: ServiceResult<T>,
): asserts result is Exclude<ServiceResult<T>, ErrorResult> {
  if (result.success) return;

  const { code, errors = [] } = result;
  const errorOptions = { errors };

  switch (code) {
    case Codes.BadRequest:
      throw new BadRequestError('Bad Request', errorOptions);
    case Codes.Forbidden:
      throw new ForbiddenError('Forbidden', errorOptions);
    case Codes.NotFound:
      throw new NotFoundError('Not Found', errorOptions);
    default:
      throw new UnprocessableEntityError('Unprocessable Content', errorOptions);
  }
}
