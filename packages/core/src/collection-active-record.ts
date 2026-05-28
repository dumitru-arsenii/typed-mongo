import { createActiveRecord, type TypedMongoActiveRecord } from "./active-record";
import {
  getInitializedRepository,
  initRepository,
  type InitializedTypedMongoRepository,
  type InferCollectionId,
  type TypedMongoFilter,
  type TypedMongoRepository,
  type TypedMongoUpdate,
} from "./repository";
import type {
  AnyTypedMongoCollection,
  InferDocument,
  InferInsertDocument,
  InferUpdatePatch,
} from "./collection";

export type TypedMongoCollectionDocument<TCollection> = InferDocument<TCollection> &
  object;

export type TypedMongoCollectionActiveRecord<
  TCollection extends AnyTypedMongoCollection,
  TId = string,
> = TypedMongoActiveRecord<TypedMongoCollectionDocument<TCollection>, TId>;

export type AnyTypedMongoActiveRecordCollection = TypedMongoActiveRecordCollection<
  AnyTypedMongoCollection,
  any
>;

export type InferActiveRecordCollectionDocument<TCollection> =
  TCollection extends TypedMongoActiveRecordCollection<infer TDefinition, any>
    ? TypedMongoCollectionDocument<TDefinition>
    : never;

export type InferActiveRecordCollectionId<TCollection> =
  TCollection extends TypedMongoActiveRecordCollection<any, infer TId> ? TId : never;

export type InferActiveRecordCollectionRecord<TCollection> =
  TCollection extends TypedMongoActiveRecordCollection<infer TDefinition, infer TId>
    ? TypedMongoCollectionActiveRecord<TDefinition, TId>
    : never;

export type TypedMongoActiveRecordCollectionRepository<
  TCollection extends AnyTypedMongoCollection,
  TId = string,
> = InitializedTypedMongoRepository<TypedMongoCollectionDocument<TCollection>, TId>;

export type TypedMongoActiveRecordCollection<
  TCollection extends AnyTypedMongoCollection,
  TId = string,
> = TCollection & {
  readonly collection: TCollection;
  readonly repository: TypedMongoActiveRecordCollectionRepository<TCollection, TId>;
  byId(id: TId): Promise<TypedMongoCollectionActiveRecord<TCollection, TId>>;
  activeRecord(
    document: TypedMongoCollectionDocument<TCollection>,
    options?: { persisted?: boolean | undefined },
  ): TypedMongoCollectionActiveRecord<TCollection, TId>;
  create(
    document: InferInsertDocument<TCollection>,
  ): TypedMongoCollectionActiveRecord<TCollection, TId>;
  deleteById(id: TId): Promise<void>;
  deleteMany(
    filter: TypedMongoFilter<TypedMongoCollectionDocument<TCollection>>,
  ): Promise<number>;
  deleteOne(
    filter: TypedMongoFilter<TypedMongoCollectionDocument<TCollection>>,
  ): Promise<boolean>;
  findById(id: TId): Promise<TypedMongoCollectionActiveRecord<TCollection, TId> | null>;
  findMany(
    filter?: TypedMongoFilter<TypedMongoCollectionDocument<TCollection>>,
  ): Promise<TypedMongoCollectionActiveRecord<TCollection, TId>[]>;
  findOne(
    filter: TypedMongoFilter<TypedMongoCollectionDocument<TCollection>>,
  ): Promise<TypedMongoCollectionActiveRecord<TCollection, TId> | null>;
  getById(id: TId): Promise<TypedMongoCollectionActiveRecord<TCollection, TId>>;
  insertOne(
    document: InferInsertDocument<TCollection>,
  ): Promise<TypedMongoCollectionActiveRecord<TCollection, TId>>;
  insertMany(
    documents: readonly InferInsertDocument<TCollection>[],
  ): Promise<TypedMongoCollectionActiveRecord<TCollection, TId>[]>;
  updateById(
    id: TId,
    patch:
      | InferUpdatePatch<TCollection>
      | TypedMongoUpdate<TypedMongoCollectionDocument<TCollection>>,
  ): Promise<TypedMongoCollectionActiveRecord<TCollection, TId>>;
  updateMany(
    filter: TypedMongoFilter<TypedMongoCollectionDocument<TCollection>>,
    update: TypedMongoUpdate<TypedMongoCollectionDocument<TCollection>>,
  ): Promise<TypedMongoCollectionActiveRecord<TCollection, TId>[]>;
  updateOne(
    filter: TypedMongoFilter<TypedMongoCollectionDocument<TCollection>>,
    update: TypedMongoUpdate<TypedMongoCollectionDocument<TCollection>>,
  ): Promise<TypedMongoCollectionActiveRecord<TCollection, TId> | null>;
};

export function createActiveRecordCollection<
  TCollection extends AnyTypedMongoCollection,
  TId = string,
>(
  collection: TCollection,
  repository: TypedMongoActiveRecordCollectionRepository<TCollection, TId>,
): TypedMongoActiveRecordCollection<TCollection, TId> {
  const wrap = (
    document: TypedMongoCollectionDocument<TCollection>,
    options: { persisted?: boolean | undefined } = {},
  ): TypedMongoCollectionActiveRecord<TCollection, TId> =>
    createActiveRecord(document, repository, {
      collectionName: collection.name,
      getId: (currentDocument) =>
        (currentDocument as Record<string, unknown>)[collection.idKey] as TId,
      persisted: options.persisted,
    });

  return {
    ...collection,
    async byId(id) {
      return this.getById(id);
    },
    activeRecord(document, options) {
      return wrap(
        collection.parse(document) as TypedMongoCollectionDocument<TCollection>,
        options,
      );
    },
    create(document) {
      return this.activeRecord(
        collection.parse(document) as TypedMongoCollectionDocument<TCollection>,
        { persisted: false },
      );
    },
    collection,
    async deleteById(id) {
      await repository.deleteById(id);
    },
    async deleteMany(filter) {
      return repository.deleteMany(filter);
    },
    async deleteOne(filter) {
      return repository.deleteOne(filter);
    },
    async findById(id) {
      const document = await repository.findById(id);

      return document === null ? null : wrap(collection.parse(document));
    },
    async findMany(filter = {}) {
      const documents = await repository.findMany(filter);

      return documents.map((document) => wrap(collection.parse(document)));
    },
    async findOne(filter) {
      const document = await repository.findOne(filter);

      return document === null ? null : wrap(collection.parse(document));
    },
    async getById(id) {
      const document = await repository.getById(id);

      return wrap(collection.parse(document));
    },
    async insertMany(documents) {
      const parsed = documents.map(
        (document) =>
          collection.parse(document) as TypedMongoCollectionDocument<TCollection>,
      );
      const inserted = await repository.insertMany(parsed);

      return inserted.map((document) => wrap(collection.parse(document)));
    },
    async insertOne(document) {
      return (await this.insertMany([document]))[0] as TypedMongoCollectionActiveRecord<
        TCollection,
        TId
      >;
    },
    repository,
    async updateById(id, patch) {
      const document = await repository.updateById(id, patch);

      return wrap(collection.parse(document));
    },
    async updateMany(filter, update) {
      const documents = await repository.updateMany(filter, update);

      return documents.map((document) => wrap(collection.parse(document)));
    },
    async updateOne(filter, update) {
      const document = await repository.updateOne(filter, update);

      return document === null ? null : wrap(collection.parse(document));
    },
  };
}

export function initAR<
  TCollection extends AnyTypedMongoCollection,
  TId = InferCollectionId<TCollection>,
>(
  collection: TCollection,
  repository: TypedMongoActiveRecordCollectionRepository<
    TCollection,
    TId
  > = (getInitializedRepository<TCollection, TId>(collection) ??
    initRepository<TCollection, TId>(
      collection,
    )) as TypedMongoActiveRecordCollectionRepository<TCollection, TId>,
): TypedMongoActiveRecordCollection<TCollection, TId> {
  return createActiveRecordCollection(collection, repository);
}

export function isTypedMongoActiveRecordCollection(
  value: unknown,
): value is AnyTypedMongoActiveRecordCollection {
  return (
    value !== null &&
    typeof value === "object" &&
    "collection" in value &&
    "repository" in value &&
    typeof (value as { getById?: unknown }).getById === "function"
  );
}

export function activeRecordCollectionToRepository<
  TCollection extends AnyTypedMongoActiveRecordCollection,
>(
  collection: TCollection,
): TypedMongoRepository<
  InferActiveRecordCollectionDocument<TCollection>,
  InferActiveRecordCollectionId<TCollection>
> {
  return collection.repository as TypedMongoRepository<
    InferActiveRecordCollectionDocument<TCollection>,
    InferActiveRecordCollectionId<TCollection>
  >;
}
