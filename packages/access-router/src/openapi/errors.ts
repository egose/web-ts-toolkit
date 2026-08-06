export class OpenApiCollisionError extends Error {
  readonly collisionKind: 'path' | 'operationId';
  readonly method?: string;
  readonly path?: string;
  readonly operationId?: string;
  readonly existing?: unknown;
  readonly incoming?: unknown;

  constructor(
    message: string,
    details: {
      collisionKind: 'path' | 'operationId';
      method?: string;
      path?: string;
      operationId?: string;
      existing?: unknown;
      incoming?: unknown;
    },
  ) {
    super(message);
    this.name = 'OpenApiCollisionError';
    this.collisionKind = details.collisionKind;
    this.method = details.method;
    this.path = details.path;
    this.operationId = details.operationId;
    this.existing = details.existing;
    this.incoming = details.incoming;
  }
}
