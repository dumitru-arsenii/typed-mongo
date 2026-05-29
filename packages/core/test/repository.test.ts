import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { entityManager, syncIndexes, TypedMongoValidationError } from "../src";
import { clearMongo, startMongo, stopMongo, UserEntity } from "./helpers";

describe("repository", () => {
  beforeAll(async () => {
    await startMongo();
  });

  beforeEach(async () => {
    await clearMongo();
  });

  afterAll(async () => {
    await stopMongo();
  });

  it("validates and creates documents with defaults", async () => {
    const user = await entityManager.repo(UserEntity).create({
      email: "john@example.com",
      name: "John",
    });

    expect(user._id).toBeInstanceOf(ObjectId);
    expect(user.role).toBe("user");
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid create input", async () => {
    await expect(
      entityManager.repo(UserEntity).create({
        email: "nope",
        name: "John",
      }),
    ).rejects.toBeInstanceOf(TypedMongoValidationError);
  });

  it("findById accepts ObjectId and string ids", async () => {
    const repository = entityManager.repo(UserEntity);
    const user = await repository.create({
      email: "john@example.com",
      name: "John",
    });

    await expect(repository.findById(user._id)).resolves.toMatchObject({
      email: "john@example.com",
    });
    await expect(repository.findById(user._id.toHexString())).resolves.toMatchObject({
      email: "john@example.com",
    });
  });

  it("validates merged documents on update", async () => {
    const repository = entityManager.repo(UserEntity);
    const user = await repository.create({
      email: "john@example.com",
      name: "John",
    });

    await expect(repository.updateById(user._id, { name: "" })).rejects.toBeInstanceOf(
      TypedMongoValidationError,
    );
    await expect(
      repository.updateById(user._id, { name: "Johnny" }),
    ).resolves.toMatchObject({
      name: "Johnny",
    });
  });

  it("supports count, exists, delete, and index sync", async () => {
    const repository = entityManager.repo(UserEntity);
    await syncIndexes([UserEntity]);
    await repository.create({
      email: "john@example.com",
      name: "John",
    });

    await expect(repository.count()).resolves.toBe(1);
    await expect(repository.exists({ email: "john@example.com" })).resolves.toBe(true);
    await expect(repository.deleteOne({ email: "john@example.com" })).resolves.toBe(
      true,
    );
    await expect(repository.count()).resolves.toBe(0);
  });
});
