import { MongoMemoryReplSet } from "mongodb-memory-server";
import { z } from "zod";

import {
  connectMongo,
  createMongoEntity,
  disconnectMongo,
  getMongoConnection,
  hasMongoConnection,
  mongoId,
  timestamps,
} from "../src";

export const UserEntity = createMongoEntity({
  collection: "users",
  indexes: [{ keys: { email: 1 }, unique: true }],
  schema: z.object({
    _id: mongoId().optional(),
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(["admin", "user"]).default("user"),
    ...timestamps(),
  }),
});

export const ProfileEntity = createMongoEntity({
  collection: "profiles",
  schema: z.object({
    _id: mongoId().optional(),
    displayName: z.string().min(1),
    userId: mongoId(),
    ...timestamps(),
  }),
});

let replSet: MongoMemoryReplSet | null = null;

export async function startMongo() {
  const testMongoUri = process.env.TEST_MONGO_URI;

  if (testMongoUri !== undefined) {
    if (hasMongoConnection()) {
      return getMongoConnection();
    }

    return connectMongo({
      database: process.env.TEST_MONGO_DATABASE ?? "typed_mongo_test",
      uri: testMongoUri,
    });
  }

  if (replSet !== null && hasMongoConnection()) {
    return getMongoConnection();
  }

  replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
    },
  });

  const connection = await connectMongo({
    database: "typed_mongo_test",
    uri: replSet.getUri(),
  });

  return connection;
}

export async function stopMongo() {
  await disconnectMongo();

  if (process.env.TEST_MONGO_URI !== undefined) {
    return;
  }

  await replSet?.stop();
  replSet = null;
}

export async function clearMongo() {
  if (!hasMongoConnection()) {
    return;
  }

  await getMongoConnection().db.dropDatabase();
}
