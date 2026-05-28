import { TypedMongoDuplicateCollectionError, TypedMongoError } from "./errors";
import type { AnyTypedMongoCollection } from "./collection";

export class TypedMongoCollectionRegistry {
  readonly #collections = new Map<string, AnyTypedMongoCollection>();

  clear(): void {
    this.#collections.clear();
  }

  get<TCollection extends AnyTypedMongoCollection = AnyTypedMongoCollection>(
    name: string,
  ): TCollection | undefined {
    return this.#collections.get(name) as TCollection | undefined;
  }

  has(name: string): boolean {
    return this.#collections.has(name);
  }

  list(): AnyTypedMongoCollection[] {
    return Array.from(this.#collections.values());
  }

  register<TCollection extends AnyTypedMongoCollection>(
    collection: TCollection,
  ): TCollection {
    if (this.#collections.has(collection.name)) {
      throw new TypedMongoDuplicateCollectionError(collection.name);
    }

    this.#collections.set(collection.name, collection);
    return collection;
  }

  require<TCollection extends AnyTypedMongoCollection = AnyTypedMongoCollection>(
    name: string,
  ): TCollection {
    const collection = this.get<TCollection>(name);

    if (collection === undefined) {
      throw new TypedMongoError(`Collection "${name}" is not registered.`, {
        code: "TYPED_MONGO_COLLECTION_NOT_REGISTERED",
      });
    }

    return collection;
  }
}

export function createCollectionRegistry(
  collections: readonly AnyTypedMongoCollection[] = [],
): TypedMongoCollectionRegistry {
  const registry = new TypedMongoCollectionRegistry();

  for (const collection of collections) {
    registry.register(collection);
  }

  return registry;
}

export const globalCollectionRegistry = new TypedMongoCollectionRegistry();

export function registerCollection<TCollection extends AnyTypedMongoCollection>(
  collection: TCollection,
  registry: TypedMongoCollectionRegistry = globalCollectionRegistry,
): TCollection {
  return registry.register(collection);
}
