import type { IndexDescription } from "mongodb";

import { getMongoConnection } from "./connection";
import type { MongoEntity, MongoEntityIndex } from "./entity";

export async function syncIndexes(
  entities: MongoEntity[],
  db = getMongoConnection().db,
): Promise<void> {
  for (const entity of entities) {
    if (entity.indexes.length === 0) {
      continue;
    }

    await db
      .collection(entity.collection)
      .createIndexes(entity.indexes.map(normalizeEntityIndex));
  }
}

export function normalizeEntityIndex(index: MongoEntityIndex): IndexDescription {
  const { keys, ...rest } = index;
  const key = rest.key ?? keys;

  if (key === undefined) {
    throw new Error("Mongo entity index requires key or keys.");
  }

  return {
    ...rest,
    key,
  };
}
