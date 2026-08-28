import {
  ObjectId,
  type ClientSession,
  type Collection,
  type Db,
  type Filter,
  type FindOptions,
  type OptionalUnlessRequiredId,
  type UpdateFilter,
} from "mongodb";
import { ZodError, ZodObject, type TypeOf, type ZodTypeAny } from "zod";

import { TypedMongoValidationError } from "./errors";
import { isIdentitySchema } from "./zod-helpers";
import type {
  EntityInput,
  EntityType,
  EntityUpdate,
  MongoEntity,
  MongoVariantEntity,
} from "./entity";

export interface Repository<
  TDocument extends { _id?: ObjectId },
  TCreateInput = Partial<TDocument>,
  TUpdateInput = Partial<TDocument>,
> {
  collection: Collection<TDocument>;
  create(input: TCreateInput): Promise<TDocument>;
  insertMany(inputs: TCreateInput[]): Promise<TDocument[]>;
  findById(id: ObjectId | string): Promise<TDocument | null>;
  findOne(
    filter: Filter<TDocument>,
    options?: FindOptions<TDocument>,
  ): Promise<TDocument | null>;
  findMany(
    filter?: Filter<TDocument>,
    options?: FindOptions<TDocument>,
  ): Promise<TDocument[]>;
  updateById(id: ObjectId | string, patch: TUpdateInput): Promise<TDocument | null>;
  updateOne(filter: Filter<TDocument>, patch: TUpdateInput): Promise<TDocument | null>;
  deleteById(id: ObjectId | string): Promise<boolean>;
  deleteOne(filter: Filter<TDocument>): Promise<boolean>;
  count(filter?: Filter<TDocument>): Promise<number>;
  exists(filter: Filter<TDocument>): Promise<boolean>;
}

export type RepositoryOf<TSchema extends ZodTypeAny> = Repository<
  TypeOf<TSchema> & { _id: ObjectId }
>;

export type CreateRepositoryOptions<TEntity extends MongoEntity<any>> = {
  db: () => Db;
  entity: TEntity;
  session?: ClientSession;
};

export function createRepository<TEntity extends MongoEntity<any>>(
  options: CreateRepositoryOptions<TEntity>,
): Repository<EntityType<TEntity>, EntityInput<TEntity>, EntityUpdate<TEntity>> {
  type TDocument = EntityType<TEntity>;

  const getCollection = () =>
    options.db().collection<TDocument>(options.entity.collection);
  const sessionOptions = options.session ? { session: options.session } : {};
  const entity = options.entity;

  return {
    get collection() {
      return getCollection();
    },
    async count(filter = {}) {
      return getCollection().countDocuments(
        scopeVariantFilter(entity, filter),
        sessionOptions,
      );
    },
    async create(input) {
      const document = parseEntity(
        entity,
        injectId(entity, prepareInsert(withVariantDiscriminator(entity, input))),
      );

      await getCollection().insertOne(
        stripIdentityFields(entity, document) as OptionalUnlessRequiredId<TDocument>,
        sessionOptions,
      );

      return document;
    },
    async deleteById(id) {
      return this.deleteOne({ _id: normalizeId(id) } as unknown as Filter<TDocument>);
    },
    async deleteOne(filter) {
      const result = await getCollection().deleteOne(
        scopeVariantFilter(entity, filter),
        sessionOptions,
      );

      return result.deletedCount === 1;
    },
    async exists(filter) {
      return (
        (await getCollection().findOne(
          scopeVariantFilter(entity, filter),
          sessionOptions,
        )) !== null
      );
    },
    async findById(id) {
      return this.findOne({ _id: normalizeId(id) } as unknown as Filter<TDocument>);
    },
    async findMany(filter = {}, findOptions = {}) {
      const documents = await getCollection()
        .find(scopeVariantFilter(entity, filter), { ...findOptions, ...sessionOptions })
        .toArray();

      return documents.map((document) => parseEntity(entity, injectId(entity, document)));
    },
    async findOne(filter, findOptions = {}) {
      const document = await getCollection().findOne(
        scopeVariantFilter(entity, filter),
        {
          ...findOptions,
          ...sessionOptions,
        },
      );

      return document === null ? null : parseEntity(entity, injectId(entity, document));
    },
    async insertMany(inputs) {
      if (inputs.length === 0) {
        return [];
      }

      const documents = inputs.map((input) =>
        parseEntity(
          entity,
          injectId(entity, prepareInsert(withVariantDiscriminator(entity, input))),
        ),
      );

      await getCollection().insertMany(
        documents.map((doc) =>
          stripIdentityFields(entity, doc),
        ) as OptionalUnlessRequiredId<TDocument>[],
        sessionOptions,
      );

      return documents;
    },
    async updateById(id, patch) {
      return this.updateOne(
        { _id: normalizeId(id) } as unknown as Filter<TDocument>,
        patch,
      );
    },
    async updateOne(filter, patch) {
      const current = await this.findOne(filter);

      if (current === null) {
        return null;
      }

      const merged = parseEntity(
        entity,
        injectId(
          entity,
          prepareUpdate(current, removeVariantDiscriminatorFromPatch(entity, patch)),
        ),
      );
      const update = toMongoSet(entity, merged);

      await getCollection().updateOne(
        { _id: merged._id } as Filter<TDocument>,
        { $set: update } as UpdateFilter<TDocument>,
        sessionOptions,
      );

      return merged;
    },
  };
}

export function normalizeId(id: ObjectId | string): ObjectId {
  return typeof id === "string" ? new ObjectId(id) : id;
}

function prepareInsert<TDocument extends { _id?: ObjectId }>(
  input: Partial<TDocument>,
): Partial<TDocument> {
  const now = new Date();

  return {
    _id: input._id ?? new ObjectId(),
    ...input,
    createdAt: (input as { createdAt?: Date }).createdAt ?? now,
    updatedAt: (input as { updatedAt?: Date }).updatedAt ?? now,
  } as Partial<TDocument>;
}

function prepareUpdate<TDocument extends { _id?: ObjectId }>(
  current: TDocument,
  patch: Partial<TDocument>,
): TDocument {
  return {
    ...current,
    ...patch,
    _id: current._id,
    updatedAt: new Date(),
  } as TDocument;
}

function parseEntity<TEntity extends MongoEntity<any>>(
  entity: TEntity,
  input: unknown,
): EntityType<TEntity> {
  try {
    return entity.parse(input) as EntityType<TEntity>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TypedMongoValidationError(
        `Document failed validation for collection "${entity.collection}".`,
        error.issues,
      );
    }

    throw error;
  }
}

function getIdentityFields(schema: ZodTypeAny): string[] {
  if (!(schema instanceof ZodObject)) return [];

  return Object.entries(schema.shape).flatMap(([key, fieldSchema]) =>
    isIdentitySchema(fieldSchema) ? [key] : [],
  );
}

function injectId<TDocument extends { _id?: ObjectId }>(
  entity: MongoEntity<any>,
  document: TDocument,
): TDocument {
  const fields = getIdentityFields(entity.schema);

  if (fields.length === 0) return document;

  const id = document._id?.toString();
  const injected: Record<string, unknown> = { ...(document as Record<string, unknown>) };

  for (const field of fields) {
    injected[field] = id;
  }

  return injected as TDocument;
}

function stripIdentityFields<TDocument>(
  entity: MongoEntity<any>,
  document: TDocument,
): TDocument {
  const fields = getIdentityFields(entity.schema);

  if (fields.length === 0) return document;

  const stripped: Record<string, unknown> = { ...(document as Record<string, unknown>) };

  for (const field of fields) {
    delete stripped[field];
  }

  return stripped as TDocument;
}

function toMongoSet<TDocument extends { _id?: ObjectId }>(
  entity: MongoEntity<any>,
  document: TDocument,
): Partial<TDocument> {
  const { _id: _id, ...update } = stripIdentityFields(entity, document);

  return update as Partial<TDocument>;
}

function isVariantEntity(entity: MongoEntity<any>): entity is MongoVariantEntity {
  return entity.kind === "variant";
}

function withVariantDiscriminator<TInput>(
  entity: MongoEntity<any>,
  input: TInput,
): Partial<TInput> {
  if (!isVariantEntity(entity)) {
    return input as Partial<TInput>;
  }

  return {
    ...(input as Record<string, unknown>),
    [entity.discriminator]: entity.discriminatorValue,
  } as Partial<TInput>;
}

function scopeVariantFilter<TDocument>(
  entity: MongoEntity<any>,
  filter: Filter<TDocument>,
): Filter<TDocument> {
  if (!isVariantEntity(entity)) {
    return filter;
  }

  return {
    ...filter,
    [entity.discriminator]: entity.discriminatorValue,
  } as Filter<TDocument>;
}

function removeVariantDiscriminatorFromPatch<TInput>(
  entity: MongoEntity<any>,
  patch: TInput,
): Partial<TInput> {
  if (!isVariantEntity(entity)) {
    return patch as Partial<TInput>;
  }

  const next = { ...(patch as Record<string, unknown>) };

  delete next[entity.discriminator];

  return next as Partial<TInput>;
}
