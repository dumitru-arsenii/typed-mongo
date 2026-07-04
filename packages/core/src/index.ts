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
export type {
  EntityInput,
  EntityRelation,
  EntityRelationMap,
  EntityRelations,
  EntityType,
  EntityUpdate,
  MongoEntity,
  RelationBuilder,
  RelationKind,
} from "./entity";
export type { EntityManager, TransactionalEntityManager } from "./entity-manager";
export type { MongoRepository, RelationRepository, Repository } from "./repository";
export type {
  ActiveRecordDocument,
  ActiveRecordModel,
  MongoActiveRecordDocument,
  MongoActiveRecordModel,
} from "./active-record";
