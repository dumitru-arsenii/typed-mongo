import { TypedMongoError } from "./errors";

export type TypedMongoIndexDirection =
  | 1
  | -1
  | "2d"
  | "2dsphere"
  | "asc"
  | "desc"
  | "hashed"
  | "text";

export type TypedMongoIndexKeys<TDocument = unknown> = {
  [key: string]: TypedMongoIndexDirection | undefined;
} & {
  [TKey in Extract<keyof TDocument, string>]?: TypedMongoIndexDirection;
};

export interface TypedMongoIndexDefinition<TDocument = unknown> {
  keys: TypedMongoIndexKeys<TDocument>;
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
}

export interface NormalizedTypedMongoIndexDefinition<TDocument = unknown> extends Omit<
  TypedMongoIndexDefinition<TDocument>,
  "keys" | "name"
> {
  keys: Record<string, TypedMongoIndexDirection>;
  name: string;
}

export function createIndexName(
  keys: Record<string, TypedMongoIndexDirection>,
): string {
  return Object.entries(keys)
    .map(([key, direction]) => `${key}_${String(direction)}`)
    .join("_");
}

export function normalizeIndexDefinition<TDocument>(
  index: TypedMongoIndexDefinition<TDocument>,
): NormalizedTypedMongoIndexDefinition<TDocument> {
  const keys = Object.fromEntries(
    Object.entries(index.keys).filter(
      (entry): entry is [string, TypedMongoIndexDirection] => entry[1] !== undefined,
    ),
  );

  if (Object.keys(keys).length === 0) {
    throw new TypedMongoError("MongoDB index definitions require at least one key.", {
      code: "TYPED_MONGO_EMPTY_INDEX",
    });
  }

  return {
    ...index,
    keys,
    name: index.name ?? createIndexName(keys),
  };
}

export function normalizeIndexDefinitions<TDocument>(
  indexes: readonly TypedMongoIndexDefinition<TDocument>[] = [],
): NormalizedTypedMongoIndexDefinition<TDocument>[] {
  return indexes.map((index) => normalizeIndexDefinition(index));
}
