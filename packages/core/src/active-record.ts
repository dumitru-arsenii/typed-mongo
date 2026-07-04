import { ObjectId, type Filter } from "mongodb";

import type {
  EntityRelation,
  EntityRelationMap,
  EntityType,
  MongoEntity,
} from "./entity";
import type { MongoRepository, RelationRepository, Repository } from "./repository";

export interface ActiveRecordDocument<TDocument extends { _id?: ObjectId }> {
  data: TDocument;
  related: Record<string, unknown>;
  save(): Promise<this>;
  delete(): Promise<boolean>;
  reload(): Promise<this>;
  toJSON(): TDocument;
  isNew(): boolean;
  isDirty(): boolean;
}

export interface ActiveRecordModel<TDocument extends { _id?: ObjectId }> {
  create(input: Partial<TDocument>): Promise<ActiveRecordDocument<TDocument>>;
  build(input: Partial<TDocument>): ActiveRecordDocument<TDocument>;
  findById(id: ObjectId | string): Promise<ActiveRecordDocument<TDocument> | null>;
  findOne(filter: Filter<TDocument>): Promise<ActiveRecordDocument<TDocument> | null>;
  findMany(filter?: Filter<TDocument>): Promise<ActiveRecordDocument<TDocument>[]>;
}

type RelationName<TEntity extends MongoEntity<any, any>> = Extract<
  keyof EntityRelationMap<TEntity>,
  string
>;

type TargetEntity<TRelation> =
  TRelation extends EntityRelation<any, infer TTargetEntity, any, any>
    ? TTargetEntity
    : never;

type LoadedRelation<TRelation> =
  TRelation extends EntityRelation<"hasMany", infer TTargetEntity, any, any>
    ? EntityType<TTargetEntity>[]
    : TRelation extends EntityRelation<any, infer TTargetEntity, any, any>
      ? EntityType<TTargetEntity> | null
      : never;

type ActiveRecordRelated<TEntity extends MongoEntity<any, any>> = {
  [K in RelationName<TEntity>]: LoadedRelation<EntityRelationMap<TEntity>[K]>;
};

type ActiveRecordRelationAccessors<TEntity extends MongoEntity<any, any>> = {
  [K in RelationName<TEntity>]: () => RelationRepository<
    TargetEntity<EntityRelationMap<TEntity>[K]>,
    EntityRelationMap<TEntity>[K]
  >;
};

type ActiveRecordRelationLoaders<TEntity extends MongoEntity<any, any>> = {
  [K in RelationName<TEntity> as `load${Capitalize<K>}`]: () => Promise<void>;
};

export type MongoActiveRecordDocument<TEntity extends MongoEntity<any, any>> = Omit<
  ActiveRecordDocument<EntityType<TEntity>>,
  "related"
> & {
  related: ActiveRecordRelated<TEntity>;
} & ActiveRecordRelationAccessors<TEntity> &
  ActiveRecordRelationLoaders<TEntity>;

export type MongoActiveRecordModel<TEntity extends MongoEntity<any, any>> = Omit<
  ActiveRecordModel<EntityType<TEntity>>,
  "create" | "build" | "findById" | "findOne" | "findMany"
> & {
  create(input: Partial<EntityType<TEntity>>): Promise<MongoActiveRecordDocument<TEntity>>;
  build(input: Partial<EntityType<TEntity>>): MongoActiveRecordDocument<TEntity>;
  findById(id: ObjectId | string): Promise<MongoActiveRecordDocument<TEntity> | null>;
  findOne(
    filter: Filter<EntityType<TEntity>>,
  ): Promise<MongoActiveRecordDocument<TEntity> | null>;
  findMany(filter?: Filter<EntityType<TEntity>>): Promise<MongoActiveRecordDocument<TEntity>[]>;
};

export type CreateActiveRecordModelOptions<TEntity extends MongoEntity<any, any>> = {
  entity: TEntity;
  repository: MongoRepository<TEntity>;
};

export function createActiveRecordModel<TEntity extends MongoEntity<any, any>>(
  options: CreateActiveRecordModelOptions<TEntity>,
): MongoActiveRecordModel<TEntity> {
  type TDocument = EntityType<TEntity>;

  const wrap = (
    data: Partial<TDocument> | TDocument,
    persisted: boolean,
  ): MongoActiveRecordDocument<TEntity> =>
    new DefaultActiveRecordDocument(
      options.entity,
      options.repository,
      data as TDocument,
      persisted ? (data as TDocument) : null,
    ) as unknown as MongoActiveRecordDocument<TEntity>;

  return {
    build(input) {
      return wrap(input, false);
    },
    async create(input) {
      return wrap(await options.repository.create(input), true);
    },
    async findById(id) {
      const document = await options.repository.findById(id);

      return document === null ? null : wrap(document, true);
    },
    async findMany(filter = {}) {
      const documents = await options.repository.findMany(filter);

      return documents.map((document) => wrap(document, true));
    },
    async findOne(filter) {
      const document = await options.repository.findOne(filter);

      return document === null ? null : wrap(document, true);
    },
  } as MongoActiveRecordModel<TEntity>;
}

class DefaultActiveRecordDocument<
  TDocument extends { _id?: ObjectId },
> implements ActiveRecordDocument<TDocument> {
  public related: Record<string, unknown> = {};
  private snapshot: TDocument | null;

  constructor(
    private readonly entity: MongoEntity<any, any>,
    private readonly repository: Repository<TDocument>,
    public data: TDocument,
    snapshot: TDocument | null,
  ) {
    this.snapshot = clone(snapshot);
    this.defineRelationHelpers();
  }

  async delete(): Promise<boolean> {
    if (this.data._id === undefined) {
      return false;
    }

    const deleted = await this.repository.deleteById(this.data._id);

    if (deleted) {
      this.snapshot = null;
    }

    return deleted;
  }

  isDirty(): boolean {
    return stableStringify(this.data) !== stableStringify(this.snapshot);
  }

  isNew(): boolean {
    return this.snapshot === null;
  }

  async reload(): Promise<this> {
    if (this.data._id === undefined) {
      return this;
    }

    const document = await this.repository.findById(this.data._id);

    if (document !== null) {
      this.data = document;
      this.snapshot = clone(document);
    }

    return this;
  }

  async save(): Promise<this> {
    const document =
      this.data._id === undefined || this.isNew()
        ? await this.repository.create(this.data)
        : await this.repository.updateById(this.data._id, this.data);

    if (document !== null) {
      this.data = document;
      this.snapshot = clone(document);
    }

    return this;
  }

  toJSON(): TDocument {
    return this.data;
  }

  private defineRelationHelpers(): void {
    for (const relation of entityRelations(this.entity)) {
      Object.defineProperty(this, `load${pascalCase(relation.name)}`, {
        enumerable: true,
        value: async () => {
          const repository = this.relationRepository(relation);

          this.related[relation.name] =
            relation.kind === "hasMany"
              ? await repository.findMany()
              : await repository.findOne({});
        },
      });

      Object.defineProperty(this, relation.name, {
        enumerable: true,
        value: () => this.relationRepository(relation),
      });
    }
  }

  private relationRepository(relation: EntityRelation): Repository<{ _id?: ObjectId }> {
    const ownerValue = (this.data as Record<string, unknown>)[relation.localKey];

    const repository = this.repository as unknown as Record<
      string,
      (ownerId: unknown) => Repository<{ _id?: ObjectId }>
    >;
    const relationAccessor = repository[relation.name];

    return relationAccessor instanceof Function
      ? relationAccessor(ownerValue)
      : (() => {
          throw new Error(`Relation "${relation.name}" is not available.`);
        })();
  }
}

function clone<TValue>(value: TValue): TValue {
  if (value === null) {
    return value;
  }

  return cloneValue(value) as TValue;
}

function cloneValue(value: unknown): unknown {
  if (value instanceof ObjectId) {
    return new ObjectId(value);
  }

  if (value instanceof Date) {
    return new Date(value);
  }

  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]),
    );
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }

  return value;
}

function pascalCase(value: string): string {
  const first = value[0];

  return first === undefined ? value : `${first.toUpperCase()}${value.slice(1)}`;
}

function entityRelations(entity: MongoEntity<any, any>): EntityRelation[] {
  return Object.values(entity.relations) as EntityRelation[];
}
