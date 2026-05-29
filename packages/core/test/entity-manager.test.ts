import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createEntityManager, entityManager, getMongoConnection } from "../src";
import {
  clearMongo,
  ProfileEntity,
  startMongo,
  stopMongo,
  UserEntity,
} from "./helpers";

describe("entity manager", () => {
  beforeAll(async () => {
    await startMongo();
  });

  beforeEach(async () => {
    await clearMongo();
  });

  afterAll(async () => {
    await stopMongo();
  });

  it("creates repositories from the singleton connection", async () => {
    const user = await entityManager.repo(UserEntity).create({
      email: "john@example.com",
      name: "John",
    });

    await expect(
      entityManager.repo(UserEntity).findById(user._id),
    ).resolves.toMatchObject({
      email: "john@example.com",
    });
  });

  it("supports managers bound to an explicit db", async () => {
    const manager = createEntityManager({
      db: getMongoConnection().db,
    });
    const user = await manager.repo(UserEntity).create({
      email: "john@example.com",
      name: "John",
    });

    await expect(manager.repo(UserEntity).findById(user._id)).resolves.toMatchObject({
      name: "John",
    });
  });

  it("passes a session into transaction repositories", async () => {
    await entityManager.transaction(async (tx) => {
      expect(tx.session).toBeDefined();

      const user = await tx.repo(UserEntity).create({
        email: "john@example.com",
        name: "John",
      });

      await tx.repo(ProfileEntity).create({
        displayName: user.name,
        userId: user._id,
      });
    });

    await expect(entityManager.repo(ProfileEntity).count()).resolves.toBe(1);
  });

  it("rejects nested transactions", async () => {
    await expect(
      entityManager.transaction(async (tx) => tx.transaction(async () => "nope")),
    ).rejects.toThrow("Nested transactions are not supported yet.");
  });
});
