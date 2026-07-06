import { Response } from './index';

export class OK<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(200, data);
  }
}

export class Created<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(201, data);
  }
}

export class Accepted<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(202, data);
  }
}

export class NonAuthoritativeInfo<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(203, data);
  }
}

export class NoContent extends Response<undefined> {
  constructor() {
    super(204, undefined);
  }
}

export class ResetContent<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(205, data);
  }
}

export class PartialContent<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(206, data);
  }
}

export class MultiStatus<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(207, data);
  }
}

export class AlreadyReported<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(208, data);
  }
}

export class IMUsed<T = unknown> extends Response<T> {
  constructor(data: T) {
    super(226, data);
  }
}
