import { afterEach, describe, expect, it } from "vitest";

import {
  disconnectMongo,
  entityManager,
  getMongoConnection,
  hasMongoConnection,
  TypedMongoConnectionError,
} from "../src";
import { startMongo, stopMongo, UserEntity } from "./helpers";

describe("connection", () => {
  afterEach(async () => {
    await stopMongo();
  });

  it("throws only execute some method before connectMongo is called", () => {
    expect(() => {
      const repo = entityManager.repo(UserEntity);

      return repo.count();
    }).rejects.toThrow(TypedMongoConnectionError);
    expect(() => entityManager.repo(UserEntity).count()).rejects.toThrow(
      "No MongoDB connection associated. Call connectMongo(...) before using entityManager.",
    );
  });

  it("stores and clears the current connection", async () => {
    const connection = await startMongo();

    expect(hasMongoConnection()).toBe(true);
    expect(getMongoConnection()).toBe(connection);

    await disconnectMongo();

    expect(hasMongoConnection()).toBe(false);
  });
});
