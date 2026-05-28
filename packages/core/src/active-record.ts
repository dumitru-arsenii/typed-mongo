import { TypedMongoError } from "./errors";
import {
  getDocumentById,
  type TypedMongoGetByIdCapableRepository,
  type TypedMongoUpdate,
} from "./repository";

export type TypedMongoActiveRecordRepository<
  TDocument,
  TId = string,
> = TypedMongoGetByIdCapableRepository<TDocument, TId> &
  Partial<{
    deleteById(id: TId): Promise<void>;
    insertOne(document: TDocument): Promise<TDocument>;
    updateById(id: TId, patch: TypedMongoUpdate<TDocument>): Promise<TDocument>;
  }>;

export interface CreateActiveRecordOptions<TDocument, TId = string> {
  collectionName?: string | undefined;
  getId?: ((document: TDocument) => TId) | undefined;
  persisted?: boolean | undefined;
}

export type TypedMongoActiveRecordChanges<TDocument> = Partial<
  Omit<TDocument, "_id" | "id">
>;

export type TypedMongoActiveRecord<
  TDocument extends object,
  TId = string,
> = TDocument & {
  readonly $repository: TypedMongoActiveRecordRepository<TDocument, TId>;
  $changes(): TypedMongoActiveRecordChanges<TDocument>;
  $delete(): Promise<void>;
  $isDirty(): boolean;
  $reload(): Promise<TypedMongoActiveRecord<TDocument, TId>>;
  $save(): Promise<TypedMongoActiveRecord<TDocument, TId>>;
  $toObject(): TDocument;
  $update(
    patch: TypedMongoUpdate<TDocument>,
  ): Promise<TypedMongoActiveRecord<TDocument, TId>>;
  changes(): TypedMongoActiveRecordChanges<TDocument>;
  delete(): Promise<void>;
  isDirty(): boolean;
  reload(): Promise<TypedMongoActiveRecord<TDocument, TId>>;
  save(): Promise<TypedMongoActiveRecord<TDocument, TId>>;
  toObject(): TDocument;
  update(
    patch: TypedMongoUpdate<TDocument>,
  ): Promise<TypedMongoActiveRecord<TDocument, TId>>;
};

export function createActiveRecord<TDocument extends object, TId = string>(
  document: TDocument,
  repository: TypedMongoActiveRecordRepository<TDocument, TId>,
  options: CreateActiveRecordOptions<TDocument, TId> = {},
): TypedMongoActiveRecord<TDocument, TId> {
  const record = { ...document } as TypedMongoActiveRecord<TDocument, TId>;
  const state = {
    baseline: cloneDocument(document),
    deleted: false,
    persisted: options.persisted ?? true,
  };
  const resolveId = () => resolveActiveRecordId(record.$toObject(), options);

  Object.defineProperties(record, {
    $changes: {
      enumerable: false,
      value: () => computeDocumentChanges(state.baseline, record.$toObject()),
    },
    $delete: {
      enumerable: false,
      value: async () => {
        if (typeof repository.deleteById !== "function") {
          throw new TypedMongoError(
            "Active record delete requires repository.deleteById.",
            { code: "TYPED_MONGO_ACTIVE_RECORD_UNSUPPORTED" },
          );
        }

        await repository.deleteById(resolveId());
        state.deleted = true;
      },
    },
    $isDirty: {
      enumerable: false,
      value: () => Object.keys(record.$changes()).length > 0,
    },
    $repository: {
      enumerable: false,
      value: repository,
    },
    $reload: {
      enumerable: false,
      value: async () => {
        const next = await getDocumentById(repository, resolveId(), {
          collectionName: options.collectionName,
        });

        replaceRecordDocument(record, next);
        state.baseline = cloneDocument(next);
        state.deleted = false;
        return record;
      },
    },
    $save: {
      enumerable: false,
      value: async () => {
        if (state.deleted) {
          throw new TypedMongoError("Deleted active records cannot be saved.", {
            code: "TYPED_MONGO_ACTIVE_RECORD_DELETED",
          });
        }

        if (!state.persisted) {
          const inserted = await insertActiveRecord(record.$toObject(), repository);

          replaceRecordDocument(record, inserted);
          state.baseline = cloneDocument(inserted);
          state.persisted = true;
          return record;
        }

        if (typeof repository.updateById !== "function") {
          throw new TypedMongoError(
            "Active record save requires repository.updateById.",
            { code: "TYPED_MONGO_ACTIVE_RECORD_UNSUPPORTED" },
          );
        }

        const changes = record.$changes();

        if (Object.keys(changes).length === 0) {
          return record;
        }

        const next = await repository.updateById(resolveId(), changes);

        replaceRecordDocument(record, next);
        state.baseline = cloneDocument(next);
        return record;
      },
    },
    $toObject: {
      enumerable: false,
      value: () => {
        const snapshot = { ...record };

        for (const key of Object.keys(snapshot)) {
          if (key.startsWith("$")) {
            delete (snapshot as Record<string, unknown>)[key];
          }
        }

        return snapshot as TDocument;
      },
    },
    $update: {
      enumerable: false,
      value: async (patch: TypedMongoUpdate<TDocument>) => {
        if (typeof repository.updateById !== "function") {
          throw new TypedMongoError(
            "Active record update requires repository.updateById.",
            { code: "TYPED_MONGO_ACTIVE_RECORD_UNSUPPORTED" },
          );
        }

        const next = await repository.updateById(resolveId(), patch);
        replaceRecordDocument(record, next);
        state.baseline = cloneDocument(next);
        return record;
      },
    },
  });

  Object.defineProperties(record, {
    changes: {
      enumerable: false,
      value: record.$changes,
    },
    delete: {
      enumerable: false,
      value: record.$delete,
    },
    isDirty: {
      enumerable: false,
      value: record.$isDirty,
    },
    reload: {
      enumerable: false,
      value: record.$reload,
    },
    save: {
      enumerable: false,
      value: record.$save,
    },
    toObject: {
      enumerable: false,
      value: record.$toObject,
    },
    update: {
      enumerable: false,
      value: record.$update,
    },
  });

  return record;
}

export function computeDocumentChanges<TDocument extends object>(
  baseline: TDocument,
  current: TDocument,
): TypedMongoActiveRecordChanges<TDocument> {
  const changes: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(current)) {
    if (key === "_id" || key === "id") {
      continue;
    }

    if (!isEqualValue(value, (baseline as Record<string, unknown>)[key])) {
      changes[key] = value;
    }
  }

  return changes as TypedMongoActiveRecordChanges<TDocument>;
}

function resolveActiveRecordId<TDocument, TId>(
  document: TDocument,
  options: CreateActiveRecordOptions<TDocument, TId>,
): TId {
  if (options.getId !== undefined) {
    return options.getId(document);
  }

  const candidate =
    (document as { _id?: unknown; id?: unknown })._id ??
    (document as { _id?: unknown; id?: unknown }).id;

  if (candidate === undefined || candidate === null) {
    throw new TypedMongoError(
      "Active record documents require an _id/id field or a custom getId option.",
      { code: "TYPED_MONGO_ACTIVE_RECORD_ID_REQUIRED" },
    );
  }

  return candidate as TId;
}

export async function insertActiveRecord<TDocument, TId>(
  document: TDocument,
  repository: TypedMongoActiveRecordRepository<TDocument, TId>,
): Promise<TDocument> {
  if (typeof repository.insertOne !== "function") {
    throw new TypedMongoError(
      "Active record save requires repository.updateById or repository.insertOne.",
      { code: "TYPED_MONGO_ACTIVE_RECORD_UNSUPPORTED" },
    );
  }

  return repository.insertOne(document);
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

function replaceRecordDocument<TDocument extends object, TId>(
  record: TypedMongoActiveRecord<TDocument, TId>,
  document: TDocument,
): void {
  for (const key of Object.keys(record)) {
    if (!(key in document)) {
      delete (record as Record<string, unknown>)[key];
    }
  }

  Object.assign(record, document);
}
