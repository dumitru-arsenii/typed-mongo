import type { z } from "zod";

import {
  createActiveRecordCollection,
  type TypedMongoActiveRecordCollection,
} from "./collection-active-record";
import type { InitializedTypedMongoRepository } from "./repository";
import { TypedMongoValidationError } from "./errors";
import type { TypedMongoRepositoryHooks } from "./hooks";
import {
  normalizeIndexDefinitions,
  type NormalizedTypedMongoIndexDefinition,
  type TypedMongoIndexDefinition,
} from "./indexes";

export type TypedMongoSchema = z.ZodTypeAny;

export type TypedMongoSafeParseResult<TSchema extends TypedMongoSchema> =
  z.SafeParseReturnType<z.input<TSchema>, z.output<TSchema>>;

export interface DefineCollectionOptions<
  TName extends string,
  TSchema extends TypedMongoSchema,
> {
  hooks?: TypedMongoRepositoryHooks<z.output<TSchema>>;
  idKey?: Extract<keyof z.output<TSchema>, string>;
  indexes?: readonly TypedMongoIndexDefinition<z.output<TSchema>>[];
  name: TName;
  schema: TSchema;
}

export interface TypedMongoCollectionDefinition<
  TName extends string = string,
  TSchema extends TypedMongoSchema = TypedMongoSchema,
> {
  readonly hooks: TypedMongoRepositoryHooks<z.output<TSchema>> | undefined;
  readonly idKey: Extract<keyof z.output<TSchema>, string> | "_id";
  readonly indexes: readonly NormalizedTypedMongoIndexDefinition<z.output<TSchema>>[];
  readonly kind: "typed-mongo.collection";
  readonly name: TName;
  readonly schema: TSchema;
  parse(input: unknown): z.output<TSchema>;
  safeParse(input: unknown): TypedMongoSafeParseResult<TSchema>;
  useRepository<TId = string>(
    repository: InitializedTypedMongoRepository<z.output<TSchema> & object, TId>,
  ): TypedMongoActiveRecordCollection<
    TypedMongoCollectionDefinition<TName, TSchema>,
    TId
  >;
}

export type AnyTypedMongoCollection = TypedMongoCollectionDefinition<string, any>;

export type InferDocument<TCollection> =
  TCollection extends TypedMongoCollectionDefinition<string, infer TSchema>
    ? z.output<TSchema>
    : never;

export type InferInsertDocument<TCollection> =
  TCollection extends TypedMongoCollectionDefinition<string, infer TSchema>
    ? z.input<TSchema>
    : never;

export type TypedMongoUpdatePatch<TDocument> = Partial<Omit<TDocument, "_id" | "id">>;

export type InferUpdatePatch<TCollection> = TypedMongoUpdatePatch<
  InferDocument<TCollection>
>;

export function defineCollection<
  const TName extends string,
  TSchema extends TypedMongoSchema,
>(
  options: DefineCollectionOptions<TName, TSchema>,
): TypedMongoCollectionDefinition<TName, TSchema> {
  const indexes = normalizeIndexDefinitions<z.output<TSchema>>(options.indexes ?? []);
  const idKey = options.idKey ?? "_id";

  const collection: TypedMongoCollectionDefinition<TName, TSchema> = {
    hooks: options.hooks,
    idKey,
    indexes,
    kind: "typed-mongo.collection",
    name: options.name,
    parse(input) {
      const result = options.schema.safeParse(input);

      if (!result.success) {
        throw new TypedMongoValidationError(options.name, result.error);
      }

      return result.data;
    },
    safeParse(input) {
      return options.schema.safeParse(input);
    },
    schema: options.schema,
    useRepository(repository) {
      return createActiveRecordCollection(collection, repository);
    },
  };

  return collection;
}

export function validateDocument<TCollection extends AnyTypedMongoCollection>(
  collection: TCollection,
  input: unknown,
): InferDocument<TCollection> {
  return collection.parse(input) as InferDocument<TCollection>;
}

export function safeValidateDocument<TCollection extends AnyTypedMongoCollection>(
  collection: TCollection,
  input: unknown,
): TCollection extends TypedMongoCollectionDefinition<string, infer TSchema>
  ? TypedMongoSafeParseResult<TSchema>
  : never {
  return collection.safeParse(
    input,
  ) as TCollection extends TypedMongoCollectionDefinition<string, infer TSchema>
    ? TypedMongoSafeParseResult<TSchema>
    : never;
}
