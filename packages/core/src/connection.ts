import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

import { TypedMongoConnectionError } from "./errors";

export type ConnectMongoOptions = {
  uri: string;
  database: string;
  clientOptions?: MongoClientOptions;
};

export type TypedMongoConnection = {
  client: MongoClient;
  db: Db;
};

let currentConnection: TypedMongoConnection | null = null;

export async function connectMongo(
  options: ConnectMongoOptions,
): Promise<TypedMongoConnection> {
  const client = new MongoClient(options.uri, options.clientOptions);

  await client.connect();

  currentConnection = {
    client,
    db: client.db(options.database),
  };

  return currentConnection;
}

export function getMongoConnection(): TypedMongoConnection {
  if (currentConnection === null) {
    throw new TypedMongoConnectionError(
      "No MongoDB connection associated. Call connectMongo(...) before using entityManager.",
    );
  }

  return currentConnection;
}

export function hasMongoConnection(): boolean {
  return currentConnection !== null;
}

export async function disconnectMongo(): Promise<void> {
  if (currentConnection === null) {
    return;
  }

  await currentConnection.client.close();
  currentConnection = null;
}

export function setMongoConnection(connection: TypedMongoConnection): void {
  currentConnection = connection;
}
