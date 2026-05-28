import type { ZodError, ZodIssue } from "zod";

export interface TypedMongoErrorOptions {
  cause?: unknown;
  code?: string | undefined;
}

export class TypedMongoError extends Error {
  readonly code: string;

  constructor(message: string, options: TypedMongoErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? "TYPED_MONGO_ERROR";

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class TypedMongoValidationError extends TypedMongoError {
  readonly collectionName: string;
  readonly issues: ZodIssue[];

  constructor(collectionName: string, zodError: ZodError) {
    super(`Document failed validation for collection "${collectionName}".`, {
      cause: zodError,
      code: "TYPED_MONGO_VALIDATION_ERROR",
    });
    this.collectionName = collectionName;
    this.issues = zodError.issues;
  }
}

export interface TypedMongoNotFoundErrorOptions<TId = unknown> {
  collectionName?: string | undefined;
  id?: TId | undefined;
  message?: string | undefined;
}

export class TypedMongoNotFoundError<TId = unknown> extends TypedMongoError {
  readonly collectionName: string | undefined;
  readonly id: TId | undefined;
  readonly statusCode = 404;

  constructor(options: TypedMongoNotFoundErrorOptions<TId> = {}) {
    const subject =
      options.collectionName === undefined
        ? "Document"
        : `Document in collection "${options.collectionName}"`;
    const idSuffix = options.id === undefined ? "" : ` with id "${String(options.id)}"`;

    super(options.message ?? `${subject}${idSuffix} was not found.`, {
      code: "TYPED_MONGO_NOT_FOUND",
    });

    this.collectionName = options.collectionName;
    this.id = options.id;
  }
}

export class TypedMongoDuplicateCollectionError extends TypedMongoError {
  readonly collectionName: string;

  constructor(collectionName: string) {
    super(`Collection "${collectionName}" is already registered.`, {
      code: "TYPED_MONGO_DUPLICATE_COLLECTION",
    });
    this.collectionName = collectionName;
  }
}
