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
import type {
  EntityRelation,
  EntityRelationMap,
  EntityType,
  MongoEntity,
} from "./entity";

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
  updateMany(filter: Filter<TDocument>, patch: Partial<TDocument>): Promise<number>;
  deleteById(id: ObjectId | string): Promise<boolean>;
  deleteOne(filter: Filter<TDocument>): Promise<boolean>;
  deleteMany(filter?: Filter<TDocument>): Promise<number>;
  count(filter?: Filter<TDocument>): Promise<number>;
  exists(filter: Filter<TDocument>): Promise<boolean>;
}

type RelationName<TEntity extends MongoEntity<any, any>> = Extract<
  keyof EntityRelationMap<TEntity>,
  string
>;

type TargetEntity<TRelation> =
  TRelation extends EntityRelation<any, infer TTargetEntity, any, any>
    ? TTargetEntity
    : never;

type ForeignKey<TRelation> =
  TRelation extends EntityRelation<any, any, any, infer TForeignKey>
    ? TForeignKey
    : never;

type LoadedRelation<TRelation> =
  TRelation extends EntityRelation<"hasMany", infer TTargetEntity, any, any>
    ? EntityType<TTargetEntity>[]
    : TRelation extends EntityRelation<any, infer TTargetEntity, any, any>
      ? EntityType<TTargetEntity> | null
      : never;

type LoadedRelations<
  TEntity extends MongoEntity<any, any>,
  TName extends RelationName<TEntity>,
> = {
  [K in TName]: LoadedRelation<EntityRelationMap<TEntity>[K]>;
};

export type RelationRepository<
  TTargetEntity extends MongoEntity<any, any>,
  TRelation extends EntityRelation,
> = Omit<Repository<EntityType<TTargetEntity>>, "create" | "insertMany"> & {
  create(
    input: Partial<Omit<EntityType<TTargetEntity>, ForeignKey<TRelation>>>,
  ): Promise<EntityType<TTargetEntity>>;
  insertMany(
    inputs: Partial<Omit<EntityType<TTargetEntity>, ForeignKey<TRelation>>>[],
  ): Promise<EntityType<TTargetEntity>[]>;
};

type RelationAccessors<TEntity extends MongoEntity<any, any>> = {
  [K in RelationName<TEntity>]: (
    ownerId: unknown,
  ) => RelationRepository<TargetEntity<EntityRelationMap<TEntity>[K]>, EntityRelationMap<TEntity>[K]>;
};

type EagerLoaders<
  TEntity extends MongoEntity<any, any>,
  TLoaded extends object,
> = {
  [K in RelationName<TEntity> as `with${Capitalize<K>}`]: MongoRepository<
    TEntity,
    TLoaded & LoadedRelations<TEntity, K>
  >;
};

export type MongoRepository<
  TEntity extends MongoEntity<any, any>,
  TLoaded extends object = {},
> = Omit<Repository<EntityType<TEntity>>, "findById" | "findOne" | "findMany"> & {
  findById(id: ObjectId | string): Promise<(EntityType<TEntity> & TLoaded) | null>;
  findOne(
    filter: Filter<EntityType<TEntity>>,
    options?: FindOptions<EntityType<TEntity>>,
  ): Promise<(EntityType<TEntity> & TLoaded) | null>;
  findMany(
    filter?: Filter<EntityType<TEntity>>,
    options?: FindOptions<EntityType<TEntity>>,
  ): Promise<Array<EntityType<TEntity> & TLoaded>>;
} & RelationAccessors<TEntity> &
  EagerLoaders<TEntity, TLoaded>;

export type CreateRepositoryOptions<TEntity extends MongoEntity<any, any>> = {
  db: () => Db;
  entity: TEntity;
  session?: ClientSession;
  eagerRelations?: EntityRelation[];
};

export function createRepository<TEntity extends MongoEntity<any, any>>(
  options: CreateRepositoryOptions<TEntity>,
): MongoRepository<TEntity> {
  type TDocument = EntityType<TEntity>;

  const getCollection = () => options.db().collection<TDocument>(options.entity.collection);
  const sessionOptions = options.session ? { session: options.session } : {};
  const eagerRelations = options.eagerRelations ?? [];

  const repository: Repository<TDocument> = {
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
    async deleteMany(filter = {}) {
      const result = await getCollection().deleteMany(filter, sessionOptions);

      return result.deletedCount;
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

      const parsed = documents.map((document) => parseEntity(options.entity, document));

      return loadRelationsMany(parsed, eagerRelations, options);
    },
    async findOne(filter, findOptions = {}) {
      const document = await getCollection().findOne(filter, {
        ...findOptions,
        ...sessionOptions,
      });

      const parsed = document === null ? null : parseEntity(options.entity, document);

      return parsed === null ? null : loadRelations(parsed, eagerRelations, options);
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
      const document = await getCollection().findOne(filter, sessionOptions);
      const current =
        document === null ? null : parseEntity(options.entity, document);

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
    async updateMany(filter, patch) {
      const documents = await this.findMany(filter);

      for (const document of documents) {
        await this.updateById(document._id, patch);
      }

      return documents.length;
    },
  };

  defineRelationHelpers(repository, options, eagerRelations);

  return repository as MongoRepository<TEntity>;
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

function parseEntity<TEntity extends MongoEntity<any, any>>(
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

function defineRelationHelpers<TEntity extends MongoEntity<any, any>>(
  repository: Repository<EntityType<TEntity>>,
  options: CreateRepositoryOptions<TEntity>,
  eagerRelations: EntityRelation[],
): void {
  for (const relation of entityRelations(options.entity)) {
    Object.defineProperty(repository, `with${pascalCase(relation.name)}`, {
      enumerable: true,
      get() {
        return createRepository(repositoryOptions(options, options.entity, [
          ...eagerRelations,
          relation,
        ]));
      },
    });

    Object.defineProperty(repository, relation.name, {
      enumerable: true,
      value(ownerId: unknown) {
        return createScopedRelationRepository(relation, ownerId, options);
      },
    });
  }
}

function createScopedRelationRepository(
  relation: EntityRelation,
  ownerId: unknown,
  ownerOptions: CreateRepositoryOptions<MongoEntity<any, any>>,
): Repository<{ _id?: ObjectId }> {
  const target = relation.target();
  const targetRepository = createRepository(
    repositoryOptions(ownerOptions, target),
  ) as Repository<{ _id?: ObjectId }>;

  const scopedFilter = (filter: Filter<{ _id?: ObjectId }> = {}) =>
    ({
      ...filter,
      [relation.foreignKey]: ownerId,
    }) as Filter<{ _id?: ObjectId }>;

  const scopedInput = (input: Partial<{ _id?: ObjectId }>) =>
    ({
      ...input,
      [relation.foreignKey]: ownerId,
    }) as Partial<{ _id?: ObjectId }>;

  return {
    get collection() {
      return targetRepository.collection;
    },
    count(filter = {}) {
      return targetRepository.count(scopedFilter(filter));
    },
    create(input) {
      return targetRepository.create(scopedInput(input));
    },
    deleteById(id) {
      return targetRepository.deleteOne(scopedFilter({ _id: normalizeId(id) }));
    },
    deleteMany(filter = {}) {
      return targetRepository.deleteMany(scopedFilter(filter));
    },
    deleteOne(filter) {
      return targetRepository.deleteOne(scopedFilter(filter));
    },
    exists(filter) {
      return targetRepository.exists(scopedFilter(filter));
    },
    findById(id) {
      return targetRepository.findOne(scopedFilter({ _id: normalizeId(id) }));
    },
    findMany(filter = {}, findOptions = {}) {
      return targetRepository.findMany(scopedFilter(filter), findOptions);
    },
    findOne(filter, findOptions = {}) {
      return targetRepository.findOne(scopedFilter(filter), findOptions);
    },
    insertMany(inputs) {
      return targetRepository.insertMany(inputs.map(scopedInput));
    },
    updateById(id, patch) {
      return targetRepository.updateOne(scopedFilter({ _id: normalizeId(id) }), patch);
    },
    updateMany(filter, patch) {
      return targetRepository.updateMany(scopedFilter(filter), patch);
    },
    updateOne(filter, patch) {
      return targetRepository.updateOne(scopedFilter(filter), patch);
    },
  };
}

async function loadRelationsMany<TEntity extends MongoEntity<any, any>>(
  documents: EntityType<TEntity>[],
  relations: EntityRelation[],
  options: CreateRepositoryOptions<TEntity>,
): Promise<EntityType<TEntity>[]> {
  if (documents.length === 0 || relations.length === 0) {
    return documents;
  }

  const loaded = documents.map((document) => ({ ...document }));

  for (const relation of relations) {
    await loadRelation(loaded, relation, options);
  }

  return loaded;
}

async function loadRelations<TEntity extends MongoEntity<any, any>>(
  document: EntityType<TEntity>,
  relations: EntityRelation[],
  options: CreateRepositoryOptions<TEntity>,
): Promise<EntityType<TEntity>> {
  const [loaded] = await loadRelationsMany([document], relations, options);

  return loaded ?? document;
}

async function loadRelation<TEntity extends MongoEntity<any, any>>(
  documents: EntityType<TEntity>[],
  relation: EntityRelation,
  options: CreateRepositoryOptions<TEntity>,
): Promise<void> {
  const targetRepository = createRepository(repositoryOptions(options, relation.target()));
  const localValues = documents
    .map((document) => getDocumentValue(document, relation.localKey))
    .filter((value) => value !== undefined);

  if (localValues.length === 0) {
    assignEmptyRelation(documents, relation);
    return;
  }

  const relatedDocuments = await targetRepository.findMany({
    [relation.foreignKey]: { $in: localValues },
  } as Filter<EntityType<ReturnType<typeof relation.target>>>);
  const relatedByKey = new Map<string, Array<Record<string, unknown>>>();

  for (const related of relatedDocuments) {
    const key = keyForValue(getDocumentValue(related, relation.foreignKey));
    const bucket = relatedByKey.get(key) ?? [];

    bucket.push(related);
    relatedByKey.set(key, bucket);
  }

  for (const document of documents) {
    const localKey = keyForValue(getDocumentValue(document, relation.localKey));
    const matches = relatedByKey.get(localKey) ?? [];

    (document as Record<string, unknown>)[relation.name] =
      relation.kind === "hasMany" ? matches : (matches[0] ?? null);
  }
}

function assignEmptyRelation<TEntity extends MongoEntity<any, any>>(
  documents: EntityType<TEntity>[],
  relation: EntityRelation,
): void {
  for (const document of documents) {
    (document as Record<string, unknown>)[relation.name] =
      relation.kind === "hasMany" ? [] : null;
  }
}

function getDocumentValue(document: unknown, key: string): unknown {
  return (document as Record<string, unknown>)[key];
}

function keyForValue(value: unknown): string {
  return value instanceof ObjectId ? value.toHexString() : JSON.stringify(value);
}

function pascalCase(value: string): string {
  const first = value[0];

  return first === undefined ? value : `${first.toUpperCase()}${value.slice(1)}`;
}

function entityRelations(entity: MongoEntity<any, any>): EntityRelation[] {
  return Object.values(entity.relations) as EntityRelation[];
}

function repositoryOptions<TEntity extends MongoEntity<any, any>>(
  options: Pick<CreateRepositoryOptions<MongoEntity<any, any>>, "db" | "session">,
  entity: TEntity,
  eagerRelations?: EntityRelation[],
): CreateRepositoryOptions<TEntity> {
  return {
    db: options.db,
    entity,
    ...(options.session === undefined ? {} : { session: options.session }),
    ...(eagerRelations === undefined ? {} : { eagerRelations }),
  };
}
