import type { ClientSession, Db } from "mongodb";

import { createActiveRecordModel, type MongoActiveRecordModel } from "./active-record";
import { getMongoConnection } from "./connection";
import type { MongoEntity } from "./entity";
import { createRepository, type MongoRepository } from "./repository";
import { syncIndexes } from "./sync-indexes";

export interface EntityManager {
  repo<TEntity extends MongoEntity<any, any>>(
    entity: TEntity,
  ): MongoRepository<TEntity>;
  active<TEntity extends MongoEntity<any, any>>(
    entity: TEntity,
  ): MongoActiveRecordModel<TEntity>;
  transaction<T>(callback: (tx: TransactionalEntityManager) => Promise<T>): Promise<T>;
  syncIndexes(entities: MongoEntity[]): Promise<void>;
}

export interface TransactionalEntityManager extends EntityManager {
  readonly session: ClientSession;
}

export type CreateEntityManagerOptions = {
  db?: Db;
  session?: ClientSession;
};

export function createEntityManager(
  options: CreateEntityManagerOptions = {},
): EntityManager {
  if (options.db !== undefined && options.session !== undefined) {
    return new DefaultTransactionalEntityManager(options.db, options.session);
  }

  return new DefaultEntityManager(options.db);
}

class DefaultEntityManager implements EntityManager {
  constructor(private readonly db?: Db) {}

  private getDb() {
    return this.db ?? getMongoConnection().db
  }

  active<TEntity extends MongoEntity<any, any>>(
    entity: TEntity,
  ): MongoActiveRecordModel<TEntity> {
    return createActiveRecordModel({
      entity,
      repository: this.repo(entity),
    });
  }

  repo<TEntity extends MongoEntity<any, any>>(
    entity: TEntity,
  ): MongoRepository<TEntity> {
    return createRepository({
      db: () => this.getDb(),
      entity,
    });
  }

  async syncIndexes(entities: MongoEntity[]): Promise<void> {
    await syncIndexes(entities, this.getDb());
  }

  async transaction<T>(
    callback: (tx: TransactionalEntityManager) => Promise<T>,
  ): Promise<T> {
    const connection = getMongoConnection();
    const session = connection.client.startSession();

    try {
      return await session.withTransaction(async () => {
        const tx = new DefaultTransactionalEntityManager(this.getDb(), session);

        return callback(tx);
      });
    } finally {
      await session.endSession();
    }
  }
}

class DefaultTransactionalEntityManager implements TransactionalEntityManager {
  constructor(
    private readonly db: Db,
    public readonly session: ClientSession,
  ) {}

  active<TEntity extends MongoEntity<any, any>>(
    entity: TEntity,
  ): MongoActiveRecordModel<TEntity> {
    return createActiveRecordModel({
      entity,
      repository: this.repo(entity),
    });
  }

  repo<TEntity extends MongoEntity<any, any>>(
    entity: TEntity,
  ): MongoRepository<TEntity> {
    return createRepository({
      db: () => this.db,
      entity,
      session: this.session,
    });
  }

  async syncIndexes(entities: MongoEntity[]): Promise<void> {
    await syncIndexes(entities, this.db);
  }

  async transaction<T>(): Promise<T> {
    throw new Error("Nested transactions are not supported yet.");
  }
}

export const entityManager = createEntityManager();
