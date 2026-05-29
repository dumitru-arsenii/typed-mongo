import type { IndexDescription, ObjectId } from "mongodb";
import type { z } from "zod";

type TimestampKeys<TDocument> = Extract<keyof TDocument, "createdAt" | "updatedAt">;

export type MongoEntityIndex = Omit<IndexDescription, "key"> & {
  key?: IndexDescription["key"];
  keys?: IndexDescription["key"];
};

export type MongoEntityOptions<TSchema extends z.ZodTypeAny> = {
  collection: string;
  schema: TSchema;
  indexes?: MongoEntityIndex[];
};

export type MongoEntity<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  collection: string;
  schema: TSchema;
  indexes: MongoEntityIndex[];
  parse(input: unknown): z.infer<TSchema>;
  safeParse(input: unknown): z.SafeParseReturnType<unknown, z.infer<TSchema>>;
};

export type EntityType<TEntity extends MongoEntity<any>> =
  TEntity extends MongoEntity<infer TSchema>
    ? z.infer<TSchema> & { _id: ObjectId }
    : never;

export type EntityInput<TEntity extends MongoEntity<any>> = Omit<
  EntityType<TEntity>,
  "_id" | TimestampKeys<EntityType<TEntity>>
> &
  Partial<Pick<EntityType<TEntity>, "_id" | TimestampKeys<EntityType<TEntity>>>>;

export type EntityUpdate<TEntity extends MongoEntity<any>> = Partial<
  Omit<EntityType<TEntity>, "_id" | "createdAt" | "updatedAt">
>;

export function createMongoEntity<TSchema extends z.ZodTypeAny>(
  options: MongoEntityOptions<TSchema>,
): MongoEntity<TSchema> {
  return {
    collection: options.collection,
    indexes: options.indexes ?? [],
    parse(input) {
      return options.schema.parse(input);
    },
    safeParse(input) {
      return options.schema.safeParse(input);
    },
    schema: options.schema,
  };
}
