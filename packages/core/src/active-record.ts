import { ObjectId, type Filter } from "mongodb";

import type { MongoEntity } from "./entity";
import type { Repository } from "./repository";

export interface ActiveRecordDocument<TDocument extends { _id?: ObjectId }> {
  data: TDocument;
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

export type CreateActiveRecordModelOptions<TDocument extends { _id?: ObjectId }> = {
  entity: MongoEntity<any>;
  repository: Repository<TDocument>;
};

export function createActiveRecordModel<TDocument extends { _id?: ObjectId }>(
  options: CreateActiveRecordModelOptions<TDocument>,
): ActiveRecordModel<TDocument> {
  const wrap = (
    data: Partial<TDocument> | TDocument,
    persisted: boolean,
  ): ActiveRecordDocument<TDocument> =>
    new DefaultActiveRecordDocument(
      options.repository,
      data as TDocument,
      persisted ? (data as TDocument) : null,
    );

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
  };
}

class DefaultActiveRecordDocument<
  TDocument extends { _id?: ObjectId },
> implements ActiveRecordDocument<TDocument> {
  private snapshot: TDocument | null;

  constructor(
    private readonly repository: Repository<TDocument>,
    public data: TDocument,
    snapshot: TDocument | null,
  ) {
    this.snapshot = clone(snapshot);
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
