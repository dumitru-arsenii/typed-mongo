import {
  activeRecordCollectionToRepository,
  type AnyTypedMongoActiveRecordCollection,
  type InferActiveRecordCollectionDocument,
  type InferActiveRecordCollectionId,
  type InferActiveRecordCollectionRecord,
} from "./collection-active-record";
import { TypedMongoError } from "./errors";
import type { TypedMongoRepository } from "./repository";

export type TypedMongoEntityManagerCollectionMap = Record<
  string,
  AnyTypedMongoActiveRecordCollection
>;

export type TypedMongoRepositoryMap = TypedMongoEntityManagerCollectionMap;

export type InferRepositoryDocument<TCollection> =
  InferActiveRecordCollectionDocument<TCollection>;

export type InferRepositoryId<TCollection> = InferActiveRecordCollectionId<TCollection>;

export class TypedMongoEntityManager<
  TCollections extends TypedMongoEntityManagerCollectionMap =
    TypedMongoEntityManagerCollectionMap,
> {
  constructor(private readonly collections: TCollections) {}

  activeRecord<const TName extends Extract<keyof TCollections, string>>(
    name: TName,
    document: InferActiveRecordCollectionDocument<TCollections[TName]>,
  ): InferActiveRecordCollectionRecord<TCollections[TName]> {
    return this.collection(name).activeRecord(
      document,
    ) as InferActiveRecordCollectionRecord<TCollections[TName]>;
  }

  entries(): [Extract<keyof TCollections, string>, TCollections[keyof TCollections]][] {
    return Object.entries(this.collections) as [
      Extract<keyof TCollections, string>,
      TCollections[keyof TCollections],
    ][];
  }

  async findById<const TName extends Extract<keyof TCollections, string>>(
    name: TName,
    id: InferActiveRecordCollectionId<TCollections[TName]>,
  ): Promise<InferActiveRecordCollectionRecord<TCollections[TName]> | null> {
    return this.collection(name).findById(
      id,
    ) as Promise<InferActiveRecordCollectionRecord<TCollections[TName]> | null>;
  }

  async getById<const TName extends Extract<keyof TCollections, string>>(
    name: TName,
    id: InferActiveRecordCollectionId<TCollections[TName]>,
  ): Promise<InferActiveRecordCollectionRecord<TCollections[TName]>> {
    return this.collection(name).getById(id) as Promise<
      InferActiveRecordCollectionRecord<TCollections[TName]>
    >;
  }

  has(name: string): name is Extract<keyof TCollections, string> {
    return Object.hasOwn(this.collections, name);
  }

  collection<const TName extends Extract<keyof TCollections, string>>(
    name: TName,
  ): TCollections[TName] {
    const collection = this.collections[name];

    if (collection === undefined) {
      throw new TypedMongoError(
        `Collection active record "${name}" is not registered.`,
        {
          code: "TYPED_MONGO_COLLECTION_ACTIVE_RECORD_NOT_REGISTERED",
        },
      );
    }

    return collection;
  }

  async insertOne<const TName extends Extract<keyof TCollections, string>>(
    name: TName,
    document: Parameters<TCollections[TName]["insertOne"]>[0],
  ): Promise<InferActiveRecordCollectionRecord<TCollections[TName]>> {
    return this.collection(name).insertOne(document) as Promise<
      InferActiveRecordCollectionRecord<TCollections[TName]>
    >;
  }

  repository<const TName extends Extract<keyof TCollections, string>>(
    name: TName,
  ): TypedMongoRepository<
    InferActiveRecordCollectionDocument<TCollections[TName]>,
    InferActiveRecordCollectionId<TCollections[TName]>
  > {
    return activeRecordCollectionToRepository(this.collection(name));
  }
}

export function createEntityManager<
  TCollections extends TypedMongoEntityManagerCollectionMap,
>(collections: TCollections): TypedMongoEntityManager<TCollections> {
  return new TypedMongoEntityManager(collections);
}
