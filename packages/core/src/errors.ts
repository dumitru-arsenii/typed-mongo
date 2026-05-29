export class TypedMongoConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypedMongoConnectionError";
  }
}

export class TypedMongoValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: unknown,
  ) {
    super(message);
    this.name = "TypedMongoValidationError";
  }
}
