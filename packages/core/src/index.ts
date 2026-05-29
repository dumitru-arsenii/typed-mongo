export {
  connectMongo,
  disconnectMongo,
  getMongoConnection,
  hasMongoConnection,
} from "./connection";
export { createEntityManager, entityManager } from "./entity-manager";
export { createMongoEntity } from "./entity";
export { syncIndexes } from "./sync-indexes";
export { mongoId, timestamps } from "./zod-helpers";
export { TypedMongoConnectionError, TypedMongoValidationError } from "./errors";

export type { ConnectMongoOptions, TypedMongoConnection } from "./connection";
export type { EntityInput, EntityType, EntityUpdate, MongoEntity } from "./entity";
export type { EntityManager, TransactionalEntityManager } from "./entity-manager";
export type { Repository } from "./repository";
export type { ActiveRecordDocument, ActiveRecordModel } from "./active-record";
