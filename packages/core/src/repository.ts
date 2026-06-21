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
import { ZodError } from "zod";

import { TypedMongoValidationError } from "./errors";
import type { EntityType, MongoEntity } from "./entity";

export interface Repository<TDocument extends { _id?: ObjectId }> {
  collection: Collection<TDocument>;
  create(input: Partial<TDocument>): Promise<TDocument>;
  insertMany(inputs: Partial<TDocument>[]): Promise<TDocument[]>;
  findById(id: ObjectId | string): Promise<TDocument | null>;
  findOne(
    filter: Filter<TDocument>,
    options?: FindOptions<TDocument>,
  ): Promise<TDocument | null>;
  findMany(
    filter?: Filter<TDocument>,
    options?: FindOptions<TDocument>,
  ): Promise<TDocument[]>;
  updateById(
    id: ObjectId | string,
    patch: Partial<TDocument>,
  ): Promise<TDocument | null>;
  updateOne(
    filter: Filter<TDocument>,
    patch: Partial<TDocument>,
  ): Promise<TDocument | null>;
  deleteById(id: ObjectId | string): Promise<boolean>;
  deleteOne(filter: Filter<TDocument>): Promise<boolean>;
  count(filter?: Filter<TDocument>): Promise<number>;
  exists(filter: Filter<TDocument>): Promise<boolean>;
}

export type CreateRepositoryOptions<TEntity extends MongoEntity<any>> = {
  db: () => Db;
  entity: TEntity;
  session?: ClientSession;
};

export function createRepository<TEntity extends MongoEntity<any>>(
  options: CreateRepositoryOptions<TEntity>,
): Repository<EntityType<TEntity>> {
  type TDocument = EntityType<TEntity>;

  const getCollection = () => options.db().collection<TDocument>(options.entity.collection);
  const sessionOptions = options.session ? { session: options.session } : {};

  return {
    get collection() {
      return getCollection()
    },
    async count(filter = {}) {
      return getCollection().countDocuments(filter, sessionOptions);
    },
    async create(input) {
      const document = parseEntity(options.entity, prepareInsert(input));

      await getCollection().insertOne(
        document as OptionalUnlessRequiredId<TDocument>,
        sessionOptions,
      );

      return document;
    },
    async deleteById(id) {
      return this.deleteOne({ _id: normalizeId(id) } as unknown as Filter<TDocument>);
    },
    async deleteOne(filter) {
      const result = await getCollection().deleteOne(filter, sessionOptions);

      return result.deletedCount === 1;
    },
    async exists(filter) {
      return (await getCollection().findOne(filter, sessionOptions)) !== null;
    },
    async findById(id) {
      return this.findOne({ _id: normalizeId(id) } as unknown as Filter<TDocument>);
    },
    async findMany(filter = {}, findOptions = {}) {
      const documents = await getCollection()
        .find(filter, { ...findOptions, ...sessionOptions })
        .toArray();

      return documents.map((document) => parseEntity(options.entity, document));
    },
    async findOne(filter, findOptions = {}) {
      const document = await getCollection().findOne(filter, {
        ...findOptions,
        ...sessionOptions,
      });

      return document === null ? null : parseEntity(options.entity, document);
    },
    async insertMany(inputs) {
      if (inputs.length === 0) {
        return [];
      }

      const documents = inputs.map((input) =>
        parseEntity(options.entity, prepareInsert(input)),
      );

      await getCollection().insertMany(
        documents as OptionalUnlessRequiredId<TDocument>[],
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

      const merged = parseEntity(options.entity, prepareUpdate(current, patch));
      const update = toMongoSet(merged);

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

function toMongoSet<TDocument extends { _id?: ObjectId }>(
  document: TDocument,
): Partial<TDocument> {
  const { _id: _id, ...update } = document;

  return update as Partial<TDocument>;
}
