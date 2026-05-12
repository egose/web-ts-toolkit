export enum StatusCodes {
  OK = 200,
  Created = 201,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  UnprocessableContent = 422,
}

export enum Codes {
  Success = 'success',
  Created = 'created',
  BadRequest = 'bad_request',
  Unauthorized = 'unauthorized',
  Forbidden = 'forbidden',
  NotFound = 'not_found',
}

export enum CustomHeaders {
  TotalCount = 'wtt-total-count',
  ReturnedCount = 'wtt-returned-count',
  Page = 'wtt-page',
  PageSize = 'wtt-page-size',
  TotalPages = 'wtt-total-pages',
  HasNextPage = 'wtt-has-next-page',
  HasPreviousPage = 'wtt-has-previous-page',
}

export enum FilterOperator {
  SubQuery,
  Date,
}
