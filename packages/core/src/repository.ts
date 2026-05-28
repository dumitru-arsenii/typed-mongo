import { TypedMongoError, TypedMongoNotFoundError } from "./errors";
import type { AnyTypedMongoCollection, InferDocument } from "./collection";

export interface TypedMongoRepository<TDocument, TId = string> {
  count?(filter?: TypedMongoFilter<TDocument>): Promise<number>;
  deleteById?(id: TId): Promise<void>;
  deleteMany?(filter: TypedMongoFilter<TDocument>): Promise<number>;
  deleteOne?(filter: TypedMongoFilter<TDocument>): Promise<boolean>;
  findById(id: TId): Promise<TDocument | null>;
  findMany?(filter?: TypedMongoFilter<TDocument>): Promise<TDocument[]>;
  findOne?(filter: TypedMongoFilter<TDocument>): Promise<TDocument | null>;
  getById(id: TId): Promise<TDocument>;
  insertMany?(documents: readonly TDocument[]): Promise<TDocument[]>;
  insertOne?(document: TDocument): Promise<TDocument>;
  updateById?(id: TId, patch: TypedMongoUpdate<TDocument>): Promise<TDocument>;
  updateMany?(
    filter: TypedMongoFilter<TDocument>,
    update: TypedMongoUpdate<TDocument>,
  ): Promise<TDocument[]>;
  updateOne?(
    filter: TypedMongoFilter<TDocument>,
    update: TypedMongoUpdate<TDocument>,
  ): Promise<TDocument | null>;
}

export type TypedMongoFilter<TDocument> = Partial<{
  [TKey in keyof TDocument]:
    | TDocument[TKey]
    | {
        $eq?: TDocument[TKey] | undefined;
        $in?: readonly TDocument[TKey][] | undefined;
        $ne?: TDocument[TKey] | undefined;
      };
}>;

export interface TypedMongoOperatorUpdate<TDocument> {
  $set?: Partial<Omit<TDocument, "_id" | "id">> | undefined;
  $unset?:
    | Partial<Record<Extract<keyof Omit<TDocument, "_id" | "id">, string>, true | 1>>
    | undefined;
}

export type TypedMongoUpdate<TDocument> =
  | Partial<Omit<TDocument, "_id" | "id">>
  | TypedMongoOperatorUpdate<TDocument>;

export interface InitializedTypedMongoRepository<
  TDocument,
  TId = string,
> extends Required<
  Pick<
    TypedMongoRepository<TDocument, TId>,
    | "count"
    | "deleteById"
    | "deleteMany"
    | "deleteOne"
    | "findById"
    | "findMany"
    | "findOne"
    | "getById"
    | "insertMany"
    | "insertOne"
    | "updateById"
    | "updateMany"
    | "updateOne"
  >
> {
  readonly collectionName: string;
}

export interface TypedMongoRepositoryAdapter<TDocument> {
  count?(filter?: TypedMongoFilter<TDocument>): Promise<number>;
  deleteMany(filter: TypedMongoFilter<TDocument>): Promise<number>;
  findMany(filter?: TypedMongoFilter<TDocument>): Promise<TDocument[]>;
  insertMany(documents: readonly TDocument[]): Promise<TDocument[]>;
  updateMany(
    filter: TypedMongoFilter<TDocument>,
    update: TypedMongoUpdate<TDocument>,
  ): Promise<TDocument[]>;
}

export interface InitRepositoryOptions<TDocument, TId = string> {
  adapter?: TypedMongoRepositoryAdapter<TDocument> | undefined;
  getId?: ((document: TDocument) => TId) | undefined;
  seed?: readonly TDocument[] | undefined;
}

export type InferCollectionId<TCollection> =
  InferDocument<TCollection> extends { _id: infer TId }
    ? TId
    : InferDocument<TCollection> extends { id: infer TId }
      ? TId
      : string;

const repositoryByCollection = new WeakMap<
  AnyTypedMongoCollection,
  InitializedTypedMongoRepository<any, any>
>();

export function initRepository<
  TCollection extends AnyTypedMongoCollection,
  TId = InferCollectionId<TCollection>,
>(
  collection: TCollection,
  options: InitRepositoryOptions<InferDocument<TCollection>, TId> = {},
): InitializedTypedMongoRepository<InferDocument<TCollection>, TId> {
  type TDocument = InferDocument<TCollection>;

  const getId =
    options.getId ??
    ((document: TDocument) =>
      (document as Record<string, unknown>)[collection.idKey] as TId);
  const adapter =
    options.adapter ??
    createMemoryRepositoryAdapter<TDocument, TId>({
      getId,
      seed: options.seed,
    });

  const repository: InitializedTypedMongoRepository<TDocument, TId> = {
    collectionName: collection.name,
    async count(filter = {}) {
      return adapter.count === undefined
        ? (await adapter.findMany(filter)).length
        : adapter.count(filter);
    },
    async deleteById(id) {
      await repository.deleteOne({
        [collection.idKey]: id,
      } as TypedMongoFilter<TDocument>);
    },
    async deleteMany(filter) {
      return adapter.deleteMany(filter);
    },
    async deleteOne(filter) {
      const document = await repository.findOne(filter);

      if (document === null) {
        return false;
      }

      await adapter.deleteMany({
        [collection.idKey]: getId(document),
      } as TypedMongoFilter<TDocument>);

      return true;
    },
    async findById(id) {
      return repository.findOne({
        [collection.idKey]: id,
      } as TypedMongoFilter<TDocument>);
    },
    async findMany(filter = {}) {
      const documents = await adapter.findMany(filter);

      return documents.map((document) => collection.parse(document) as TDocument);
    },
    async findOne(filter) {
      return (await repository.findMany(filter))[0] ?? null;
    },
    async getById(id) {
      const document = await repository.findById(id);

      if (document === null) {
        throw new TypedMongoNotFoundError({
          collectionName: collection.name,
          id,
        });
      }

      return document;
    },
    async insertMany(documents) {
      const parsed = documents.map(
        (document) => collection.parse(document) as TDocument,
      );

      return adapter.insertMany(parsed);
    },
    async insertOne(document) {
      return (await repository.insertMany([document]))[0] as TDocument;
    },
    async updateById(id, update) {
      const document = await repository.updateOne(
        { [collection.idKey]: id } as TypedMongoFilter<TDocument>,
        update,
      );

      if (document === null) {
        throw new TypedMongoNotFoundError({
          collectionName: collection.name,
          id,
        });
      }

      return document;
    },
    async updateMany(filter, update) {
      const documents = await adapter.updateMany(filter, update);

      return documents.map((document) => collection.parse(document) as TDocument);
    },
    async updateOne(filter, update) {
      return (await repository.updateMany(filter, update))[0] ?? null;
    },
  };

  repositoryByCollection.set(collection, repository);
  return repository;
}

export function getInitializedRepository<
  TCollection extends AnyTypedMongoCollection,
  TId = InferCollectionId<TCollection>,
>(
  collection: TCollection,
): InitializedTypedMongoRepository<InferDocument<TCollection>, TId> | undefined {
  return repositoryByCollection.get(collection) as
    | InitializedTypedMongoRepository<InferDocument<TCollection>, TId>
    | undefined;
}

export function requireInitializedRepository<
  TCollection extends AnyTypedMongoCollection,
  TId = InferCollectionId<TCollection>,
>(
  collection: TCollection,
): InitializedTypedMongoRepository<InferDocument<TCollection>, TId> {
  const repository = getInitializedRepository<TCollection, TId>(collection);

  if (repository === undefined) {
    throw new TypedMongoError(
      `Repository for collection "${collection.name}" has not been initialized.`,
      { code: "TYPED_MONGO_REPOSITORY_NOT_INITIALIZED" },
    );
  }

  return repository;
}

export function createMemoryRepositoryAdapter<TDocument, TId = string>(options: {
  getId: (document: TDocument) => TId;
  seed?: readonly TDocument[] | undefined;
}): TypedMongoRepositoryAdapter<TDocument> {
  const documents = new Map<TId, TDocument>();

  for (const document of options.seed ?? []) {
    documents.set(options.getId(document), cloneDocument(document));
  }

  return {
    async count(filter = {}) {
      return (await this.findMany(filter)).length;
    },
    async deleteMany(filter) {
      let count = 0;

      for (const [id, document] of documents) {
        if (matchesFilter(document, filter)) {
          documents.delete(id);
          count += 1;
        }
      }

      return count;
    },
    async findMany(filter = {}) {
      return Array.from(documents.values())
        .filter((document) => matchesFilter(document, filter))
        .map(cloneDocument);
    },
    async insertMany(nextDocuments) {
      const inserted = nextDocuments.map(cloneDocument);

      for (const document of inserted) {
        documents.set(options.getId(document), cloneDocument(document));
      }

      return inserted.map(cloneDocument);
    },
    async updateMany(filter, update) {
      const updated: TDocument[] = [];

      for (const [id, document] of documents) {
        if (!matchesFilter(document, filter)) {
          continue;
        }

        const next = applyUpdate(document, update);
        documents.set(id, cloneDocument(next));
        updated.push(cloneDocument(next));
      }

      return updated;
    },
  };
}

function matchesFilter<TDocument>(
  document: TDocument,
  filter: TypedMongoFilter<TDocument> = {},
): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const value = (document as Record<string, unknown>)[key];

    if (isOperatorCondition(condition)) {
      if ("$eq" in condition && !isEqualValue(value, condition.$eq)) {
        return false;
      }

      if ("$ne" in condition && isEqualValue(value, condition.$ne)) {
        return false;
      }

      if (
        "$in" in condition &&
        condition.$in !== undefined &&
        !condition.$in.some((candidate) => isEqualValue(value, candidate))
      ) {
        return false;
      }

      return true;
    }

    return isEqualValue(value, condition);
  });
}

function applyUpdate<TDocument>(
  document: TDocument,
  update: TypedMongoUpdate<TDocument>,
): TDocument {
  const next = { ...(document as Record<string, unknown>) };

  if (isOperatorUpdate(update)) {
    for (const [key, value] of Object.entries(update.$set ?? {})) {
      if (key !== "_id" && key !== "id") {
        next[key] = value;
      }
    }

    for (const key of Object.keys(update.$unset ?? {})) {
      if (key !== "_id" && key !== "id") {
        delete next[key];
      }
    }

    return next as TDocument;
  }

  for (const [key, value] of Object.entries(update)) {
    if (key !== "_id" && key !== "id") {
      next[key] = value;
    }
  }

  return next as TDocument;
}

function isOperatorCondition(value: unknown): value is {
  $eq?: unknown;
  $in?: readonly unknown[];
  $ne?: unknown;
} {
  return (
    value !== null &&
    typeof value === "object" &&
    ("$eq" in value || "$in" in value || "$ne" in value)
  );
}

function isOperatorUpdate<TDocument>(
  update: TypedMongoUpdate<TDocument>,
): update is TypedMongoOperatorUpdate<TDocument> {
  return (
    update !== null &&
    typeof update === "object" &&
    ("$set" in update || "$unset" in update)
  );
}

function cloneDocument<TDocument>(document: TDocument): TDocument {
  if (typeof structuredClone === "function") {
    return structuredClone(document);
  }

  return JSON.parse(JSON.stringify(document)) as TDocument;
}

function isEqualValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => isEqualValue(value, right[index]))
    );
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) =>
        isEqualValue(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
      )
    );
  }

  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export type TypedMongoFindByIdRepository<TDocument, TId = string> = Pick<
  TypedMongoRepository<TDocument, TId>,
  "findById"
> &
  Partial<Pick<TypedMongoRepository<TDocument, TId>, "getById">>;

export type TypedMongoGetByIdRepository<TDocument, TId = string> = Pick<
  TypedMongoRepository<TDocument, TId>,
  "getById"
> &
  Partial<Pick<TypedMongoRepository<TDocument, TId>, "findById">>;

export type TypedMongoGetByIdCapableRepository<TDocument, TId = string> =
  | TypedMongoFindByIdRepository<TDocument, TId>
  | TypedMongoGetByIdRepository<TDocument, TId>;

export interface GetDocumentByIdOptions {
  collectionName?: string | undefined;
}

export async function findDocumentById<TDocument, TId = string>(
  repository: TypedMongoGetByIdCapableRepository<TDocument, TId>,
  id: TId,
): Promise<TDocument | null> {
  if (typeof repository.findById === "function") {
    return repository.findById(id);
  }

  if (typeof repository.getById === "function") {
    try {
      return await repository.getById(id);
    } catch (error) {
      if (error instanceof TypedMongoNotFoundError) {
        return null;
      }

      throw error;
    }
  }

  throw new TypedMongoError(
    "A typed-mongo repository must implement findById or getById.",
    { code: "TYPED_MONGO_REPOSITORY_CONTRACT" },
  );
}

export async function getDocumentById<TDocument, TId = string>(
  repository: TypedMongoGetByIdCapableRepository<TDocument, TId>,
  id: TId,
  options: GetDocumentByIdOptions = {},
): Promise<TDocument> {
  if (typeof repository.getById === "function") {
    const document = await repository.getById(id);

    if (document === null || document === undefined) {
      throw new TypedMongoNotFoundError({
        collectionName: options.collectionName,
        id,
      });
    }

    return document;
  }

  const document = await findDocumentById(repository, id);

  if (document === null) {
    throw new TypedMongoNotFoundError({
      collectionName: options.collectionName,
      id,
    });
  }

  return document;
}
