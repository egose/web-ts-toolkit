export class BailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BailError';
  }
}

export function bail(message: string): never {
  throw new BailError(message);
}
