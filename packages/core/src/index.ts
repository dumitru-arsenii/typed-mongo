export {
  connectMongo,
  disconnectMongo,
  getMongoConnection,
  hasMongoConnection,
} from "./connection";
export { createEntityManager, entityManager } from "./entity-manager";
export { createMongoEntity } from "./entity";
export { syncIndexes } from "./sync-indexes";
export { identity, mongoId, timestamps } from "./zod-helpers";
export { TypedMongoConnectionError, TypedMongoValidationError } from "./errors";

export type { ConnectMongoOptions, TypedMongoConnection } from "./connection";
export type {
  BaseMongoEntity,
  EntityInput,
  EntityType,
  EntityUpdate,
  MongoDiscriminatedEntity,
  MongoEntity,
  MongoEntityIndex,
  MongoVariantEntity,
  NormalMongoEntity,
  MongoDiscriminatedVariants,
  MongoDiscriminatedEntityOf,
} from "./entity";
export type { EntityManager, TransactionalEntityManager } from "./entity-manager";
export type { Repository, RepositoryOf } from "./repository";
export type {
  ActiveRecordDocument,
  ActiveRecordModel,
  ActiveRecordModelOf,
} from "./active-record";
