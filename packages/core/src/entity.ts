import { ObjectId, type IndexDescription } from "mongodb";
import { z } from "zod";

type TimestampKeys<TDocument> = Extract<keyof TDocument, "createdAt" | "updatedAt">;

export type RelationKind = "hasOne" | "hasMany" | "belongsTo";

export type EntityRelation<
  TKind extends RelationKind = RelationKind,
  TTargetEntity extends MongoEntity<any, any> = MongoEntity<any, any>,
  TLocalKey extends string = string,
  TForeignKey extends string = string,
> = {
  kind: TKind;
  name: string;
  target: () => TTargetEntity;
  localKey: TLocalKey;
  foreignKey: TForeignKey;
};

export type EntityRelations = Record<string, EntityRelation>;

export type RelationBuilder = {
  hasOne<
    TTargetEntity extends MongoEntity<any, any>,
    TLocalKey extends string,
    TForeignKey extends string,
  >(
    target: () => TTargetEntity,
    options: {
      localKey: TLocalKey;
      foreignKey: TForeignKey;
    },
  ): EntityRelation<"hasOne", TTargetEntity, TLocalKey, TForeignKey>;

  hasMany<
    TTargetEntity extends MongoEntity<any, any>,
    TLocalKey extends string,
    TForeignKey extends string,
  >(
    target: () => TTargetEntity,
    options: {
      localKey: TLocalKey;
      foreignKey: TForeignKey;
    },
  ): EntityRelation<"hasMany", TTargetEntity, TLocalKey, TForeignKey>;

  belongsTo<
    TTargetEntity extends MongoEntity<any, any>,
    TLocalKey extends string,
    TForeignKey extends string,
  >(
    target: () => TTargetEntity,
    options: {
      localKey: TLocalKey;
      foreignKey: TForeignKey;
    },
  ): EntityRelation<"belongsTo", TTargetEntity, TLocalKey, TForeignKey>;
};

export type MongoEntityIndex = Omit<IndexDescription, "key"> & {
  key?: IndexDescription["key"];
  keys?: IndexDescription["key"];
};

export type MongoEntityOptions<
  TSchema extends z.ZodTypeAny,
  TRelations extends EntityRelations,
> = {
  collection: string;
  schema: TSchema;
  indexes?: MongoEntityIndex[];
  relations?: (builder: RelationBuilder) => TRelations;
};

export type MongoEntity<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TRelations extends EntityRelations = Record<string, never>,
> = {
  collection: string;
  schema: TSchema;
  indexes: MongoEntityIndex[];
  relations: TRelations;
  parse(input: unknown): z.infer<TSchema>;
  safeParse(input: unknown): z.SafeParseReturnType<unknown, z.infer<TSchema>>;
};

export type EntityType<TEntity extends MongoEntity<any, any>> =
  TEntity extends MongoEntity<infer TSchema, any>
    ? z.infer<TSchema> & { _id: ObjectId }
    : never;

export type EntityInput<TEntity extends MongoEntity<any, any>> = Omit<
  EntityType<TEntity>,
  "_id" | TimestampKeys<EntityType<TEntity>>
> &
  Partial<Pick<EntityType<TEntity>, "_id" | TimestampKeys<EntityType<TEntity>>>>;

export type EntityUpdate<TEntity extends MongoEntity<any, any>> = Partial<
  Omit<EntityType<TEntity>, "_id" | "createdAt" | "updatedAt">
>;

export type EntityRelationMap<TEntity extends MongoEntity<any, any>> =
  TEntity extends MongoEntity<any, infer TRelations> ? TRelations : never;

export function createMongoEntity<
  TSchema extends z.SomeZodObject,
  const TRelations extends EntityRelations = Record<string, never>,
>(options: MongoEntityOptions<TSchema, TRelations>): MongoEntity<TSchema, TRelations> {
  const entitySchema = options.schema.extend({
    _id: z.instanceof(ObjectId)
  })

  const entity: MongoEntity<TSchema, TRelations> = {
    collection: options.collection,
    indexes: options.indexes ?? [],
    relations: {} as TRelations,
    parse(input: unknown) {
      return entitySchema.parse(input);
    },
    safeParse(input: unknown) {
      return entitySchema.safeParse(input);
    },
    get schema() {
      return entitySchema as unknown as TSchema
    },
  };

  if (options.relations !== undefined) {
    entity.relations = Object.fromEntries(
      Object.entries(options.relations(createRelationBuilder())).map(
        ([name, relation]) => [name, { ...relation, name }],
      ),
    ) as TRelations;
  }

  return entity;
}

function createRelationBuilder(): RelationBuilder {
  return {
    belongsTo(target, options) {
      return { kind: "belongsTo", name: "", target, ...options };
    },
    hasMany(target, options) {
      return { kind: "hasMany", name: "", target, ...options };
    },
    hasOne(target, options) {
      return { kind: "hasOne", name: "", target, ...options };
    },
  };
}
