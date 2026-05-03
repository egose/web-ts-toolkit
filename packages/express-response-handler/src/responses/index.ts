export class Response<T = unknown> {
  readonly statusCode: number;
  readonly data: T;

  constructor(statusCode = 200, data: T) {
    this.statusCode = statusCode;
    this.data = data;
  }
}
