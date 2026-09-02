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

  it("deleteMany removes all matching documents and returns deleted count", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.create({ email: "a@example.com", name: "Alice" });
    await repository.create({ email: "b@example.com", name: "Bob" });
    await repository.create({ email: "c@example.com", name: "Charlie" });

    await expect(repository.count()).resolves.toBe(3);

    const result = await repository.deleteMany({ role: "user" });

    expect(result).toEqual({ deleted: 3 });
    await expect(repository.count()).resolves.toBe(0);
  });

  it("deleteMany returns { deleted: 0 } when no documents match", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.create({ email: "a@example.com", name: "Alice" });

    const result = await repository.deleteMany({ email: "nonexistent@example.com" });

    expect(result).toEqual({ deleted: 0 });
    await expect(repository.count()).resolves.toBe(1);
  });

  it("deleteMany only removes documents matching the filter", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.create({ email: "admin@example.com", name: "Admin", role: "admin" });
    await repository.create({ email: "user1@example.com", name: "User One" });
    await repository.create({ email: "user2@example.com", name: "User Two" });

    const result = await repository.deleteMany({ role: "user" });

    expect(result).toEqual({ deleted: 2 });
    await expect(repository.count()).resolves.toBe(1);
    await expect(repository.findOne({ role: "admin" })).resolves.toMatchObject({
      email: "admin@example.com",
    });
  });

  it("deleteById removes a document by ObjectId or string id", async () => {
    const repository = entityManager.repo(UserEntity);
    const user = await repository.create({ email: "john@example.com", name: "John" });

    await expect(repository.deleteById(user._id)).resolves.toBe(true);
    await expect(repository.findById(user._id)).resolves.toBeNull();
  });

  it("deleteById accepts a string id", async () => {
    const repository = entityManager.repo(UserEntity);
    const user = await repository.create({ email: "john@example.com", name: "John" });

    await expect(repository.deleteById(user._id.toHexString())).resolves.toBe(true);
    await expect(repository.findById(user._id)).resolves.toBeNull();
  });

  it("deleteById returns false when document does not exist", async () => {
    const repository = entityManager.repo(UserEntity);

    await expect(repository.deleteById(new ObjectId())).resolves.toBe(false);
  });

  it("insertMany creates multiple documents with defaults", async () => {
    const repository = entityManager.repo(UserEntity);
    const users = await repository.insertMany([
      { email: "a@example.com", name: "Alice" },
      { email: "b@example.com", name: "Bob" },
    ]);

    expect(users).toHaveLength(2);
    expect(users[0]._id).toBeInstanceOf(ObjectId);
    expect(users[1]._id).toBeInstanceOf(ObjectId);
    expect(users[0].role).toBe("user");
    await expect(repository.count()).resolves.toBe(2);
  });

  it("insertMany returns an empty array for empty input", async () => {
    const repository = entityManager.repo(UserEntity);
    await expect(repository.insertMany([])).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });

  it("insertMany rejects if any document fails validation", async () => {
    const repository = entityManager.repo(UserEntity);
    await expect(
      repository.insertMany([
        { email: "valid@example.com", name: "Valid" },
        { email: "not-an-email", name: "Invalid" },
      ]),
    ).rejects.toBeInstanceOf(TypedMongoValidationError);
    await expect(repository.count()).resolves.toBe(0);
  });

  it("findMany returns all documents when called without a filter", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.insertMany([
      { email: "a@example.com", name: "Alice" },
      { email: "b@example.com", name: "Bob" },
    ]);

    const users = await repository.findMany();

    expect(users).toHaveLength(2);
  });

  it("findMany returns only matching documents when filtered", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.create({ email: "admin@example.com", name: "Admin", role: "admin" });
    await repository.create({ email: "user@example.com", name: "User" });

    const admins = await repository.findMany({ role: "admin" });

    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe("admin@example.com");
  });

  it("findMany returns an empty array when no documents match", async () => {
    const repository = entityManager.repo(UserEntity);
    await expect(repository.findMany({ role: "admin" })).resolves.toEqual([]);
  });

  it("findOne returns null when no document matches", async () => {
    const repository = entityManager.repo(UserEntity);
    await expect(
      repository.findOne({ email: "nonexistent@example.com" }),
    ).resolves.toBeNull();
  });

  it("findOne returns the matching document", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.create({ email: "john@example.com", name: "John" });

    await expect(
      repository.findOne({ email: "john@example.com" }),
    ).resolves.toMatchObject({ name: "John" });
  });

  it("updateOne returns null when no document matches the filter", async () => {
    const repository = entityManager.repo(UserEntity);

    await expect(
      repository.updateOne({ email: "nonexistent@example.com" }, { name: "Ghost" }),
    ).resolves.toBeNull();
  });

  it("updateOne updates the matching document", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.create({ email: "john@example.com", name: "John" });

    const updated = await repository.updateOne(
      { email: "john@example.com" },
      { name: "Johnny" },
    );

    expect(updated).toMatchObject({ name: "Johnny", email: "john@example.com" });
    await expect(repository.findOne({ email: "john@example.com" })).resolves.toMatchObject(
      { name: "Johnny" },
    );
  });

  it("count returns 0 when the collection is empty", async () => {
    const repository = entityManager.repo(UserEntity);
    await expect(repository.count()).resolves.toBe(0);
  });

  it("count returns only documents matching the filter", async () => {
    const repository = entityManager.repo(UserEntity);
    await repository.create({ email: "admin@example.com", name: "Admin", role: "admin" });
    await repository.create({ email: "user@example.com", name: "User" });

    await expect(repository.count({ role: "admin" })).resolves.toBe(1);
    await expect(repository.count({ role: "user" })).resolves.toBe(1);
  });

  it("exists returns false when no document matches", async () => {
    const repository = entityManager.repo(UserEntity);
    await expect(
      repository.exists({ email: "nonexistent@example.com" }),
    ).resolves.toBe(false);
  });
});
