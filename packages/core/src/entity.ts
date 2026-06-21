import { ObjectId, type IndexDescription } from "mongodb";
import { z } from "zod";

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

export function createMongoEntity<TSchema extends z.SomeZodObject>(
  options: MongoEntityOptions<TSchema>,
): MongoEntity<TSchema> {
  const entitySchema = options.schema.extend({
    _id: z.instanceof(ObjectId)
  })

  return {
    collection: options.collection,
    indexes: options.indexes ?? [],
    parse(input) {
      return entitySchema.parse(input);
    },
    safeParse(input) {
      return entitySchema.safeParse(input);
    },
    get schema() {
      return entitySchema as unknown as TSchema
    },
  };
}
