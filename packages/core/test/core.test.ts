import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import {
  createCollectionRegistry,
  createActiveRecord,
  createEntityManager,
  defineCollection,
  getDocumentById,
  globalCollectionRegistry,
  initAR,
  initRepository,
  normalizeIndexDefinition,
  registerCollection,
  TypedMongoDuplicateCollectionError,
  TypedMongoError,
  TypedMongoNotFoundError,
  TypedMongoValidationError,
  type InferDocument,
  type InferInsertDocument,
  type InferUpdatePatch,
  type TypedMongoRepository,
} from "../src";
import * as publicApi from "../src";

const userSchema = z.object({
  _id: z.string(),
  createdAt: z.date(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "user"]),
  updatedAt: z.date(),
});

const users = defineCollection({
  indexes: [{ keys: { email: 1 }, unique: true }],
  name: "users",
  schema: userSchema,
});

describe("@typed-mongo/core", () => {
  it("defines collections with normalized indexes", () => {
    expect(users.name).toBe("users");
    expect(users.kind).toBe("typed-mongo.collection");
    expect(users.idKey).toBe("_id");
    expect(users.useRepository).toBeTypeOf("function");
    expect(users.indexes).toEqual([
      {
        keys: { email: 1 },
        name: "email_1",
        unique: true,
      },
    ]);
  });

  it("validates valid documents", () => {
    const document = {
      _id: "user_1",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      email: "ada@example.com",
      name: "Ada",
      role: "admin" as const,
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    };

    expect(users.parse(document)).toEqual(document);
    expect(users.safeParse(document).success).toBe(true);
  });

  it("rejects invalid documents with a typed validation error", () => {
    expect(() =>
      users.parse({
        _id: "user_1",
        createdAt: new Date(),
        email: "not-an-email",
        name: "Ada",
        role: "admin",
        updatedAt: new Date(),
      }),
    ).toThrow(TypedMongoValidationError);
  });

  it("infers document, insert, and update types", () => {
    type User = InferDocument<typeof users>;
    type InsertUser = InferInsertDocument<typeof users>;
    type UserPatch = InferUpdatePatch<typeof users>;

    expectTypeOf<User>().toEqualTypeOf<z.output<typeof userSchema>>();
    expectTypeOf<InsertUser>().toEqualTypeOf<z.input<typeof userSchema>>();
    expectTypeOf<UserPatch>().toMatchTypeOf<{
      email?: string;
      name?: string;
      role?: "admin" | "user";
    }>();
    expectTypeOf<UserPatch>().not.toHaveProperty("_id");
  });

  it("normalizes index definitions with generated names", () => {
    expect(
      normalizeIndexDefinition({
        keys: { createdAt: -1, email: 1 },
      }),
    ).toEqual({
      keys: { createdAt: -1, email: 1 },
      name: "createdAt_-1_email_1",
    });
  });

  it("registers collections and rejects duplicate names", () => {
    const registry = createCollectionRegistry([users]);

    expect(registry.get("users")).toBe(users);
    expect(registry.require("users")).toBe(users);
    expect(registry.list()).toEqual([users]);
    expect(() => registry.register(users)).toThrow(TypedMongoDuplicateCollectionError);
  });

  it("supports the global collection registry helper", () => {
    globalCollectionRegistry.clear();
    expect(registerCollection(users)).toBe(users);
    expect(globalCollectionRegistry.get("users")).toBe(users);
    globalCollectionRegistry.clear();
  });

  it("resolves repository get-by-id helpers", async () => {
    type User = InferDocument<typeof users>;
    const document: User = {
      _id: "user_1",
      createdAt: new Date(),
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      updatedAt: new Date(),
    };
    const repository: Pick<TypedMongoRepository<User>, "findById"> = {
      async findById(id) {
        return id === document._id ? document : null;
      },
    };

    await expect(getDocumentById(repository, "user_1")).resolves.toBe(document);
    await expect(
      getDocumentById(repository, "missing", { collectionName: "users" }),
    ).rejects.toMatchObject({
      collectionName: "users",
      code: "TYPED_MONGO_NOT_FOUND",
      id: "missing",
    });
  });

  it("supports entity-manager style repository access", async () => {
    type User = InferDocument<typeof users>;
    const document: User = {
      _id: "user_1",
      createdAt: new Date(),
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      updatedAt: new Date(),
    };
    const UserRepository = initRepository(users, { seed: [document] });
    const User = initAR(users);
    const manager = createEntityManager({
      users: User,
    });

    expect(manager.has("users")).toBe(true);
    expect(manager.collection("users")).toBe(User);
    expect(manager.repository("users")).toHaveProperty("findById");
    await expect(manager.findById("users", "user_1")).resolves.toMatchObject({
      _id: "user_1",
      $update: expect.any(Function),
    });
    await expect(manager.getById("users", "missing")).rejects.toBeInstanceOf(
      TypedMongoNotFoundError,
    );
    expect(await UserRepository.count()).toBe(1);
  });

  it("initializes a fully working repository for a collection", async () => {
    type User = InferDocument<typeof users>;
    const document: User = {
      _id: "user_1",
      createdAt: new Date(),
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      updatedAt: new Date(),
    };
    const UserRepository = initRepository(users, { seed: [document] });

    await expect(UserRepository.findOne({ _id: "user_1" })).resolves.toMatchObject({
      email: "ada@example.com",
    });
    await expect(UserRepository.findMany({ role: "admin" })).resolves.toHaveLength(1);
    await expect(
      UserRepository.updateMany({ role: "admin" }, { role: "user" }),
    ).resolves.toHaveLength(1);
    await expect(UserRepository.getById("user_1")).resolves.toMatchObject({
      role: "user",
    });
    await expect(UserRepository.deleteOne({ _id: "user_1" })).resolves.toBe(true);
    await expect(UserRepository.count()).resolves.toBe(0);
  });

  it("supports active-record static requests from initAR", async () => {
    type UserDocument = InferDocument<typeof users>;
    const document: UserDocument = {
      _id: "user_1",
      createdAt: new Date(),
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      updatedAt: new Date(),
    };
    const UserRepository = initRepository(users, { seed: [document] });
    const User = initAR(users);

    await expect(User.byId("user_1")).resolves.toMatchObject({
      _id: "user_1",
      $save: expect.any(Function),
      save: expect.any(Function),
    });
    await expect(User.findOne({ _id: "user_1" })).resolves.toMatchObject({
      email: "ada@example.com",
    });
    await expect(User.findMany({ role: "admin" })).resolves.toHaveLength(1);

    const userEntity = User.create({
      ...document,
      _id: "user_2",
      email: "grace@example.com",
      name: "Grace",
    });
    userEntity.name = "Grace Hopper";

    await userEntity.save();
    await expect(UserRepository.getById("user_2")).resolves.toMatchObject({
      name: "Grace Hopper",
    });
    await userEntity.delete();
    await expect(UserRepository.findById("user_2")).resolves.toBeNull();

    await expect(User.insertOne(document)).resolves.toMatchObject({
      _id: "user_1",
    });
    await expect(User.updateById("user_1", { name: "Grace" })).resolves.toMatchObject({
      name: "Grace",
    });
  });

  it("supports active-record style document helpers with dirty-change saves", async () => {
    type User = InferDocument<typeof users>;
    const document: User = {
      _id: "user_1",
      createdAt: new Date(),
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      updatedAt: new Date(),
    };
    const UserRepository = initRepository(users, { seed: [document] });
    const updateById = vi.spyOn(UserRepository, "updateById");
    const deleteById = vi.spyOn(UserRepository, "deleteById");
    const User = initAR(users);
    const record = await User.byId("user_1");

    expect(record.$isDirty()).toBe(false);
    record.name = "Grace";
    expect(record.$changes()).toEqual({ name: "Grace" });

    await expect(record.$save()).resolves.toBe(record);
    expect(updateById).toHaveBeenCalledWith("user_1", { name: "Grace" });
    expect(record.name).toBe("Grace");
    expect(record.$isDirty()).toBe(false);

    record.email = "grace@example.com";
    await expect(record.$reload()).resolves.toBe(record);
    expect(record.email).toBe("ada@example.com");
    expect(record.$isDirty()).toBe(false);

    await record.$delete();
    expect(deleteById).toHaveBeenCalledWith("user_1");
  });

  it("supports standalone active-record document helpers", async () => {
    type User = InferDocument<typeof users>;
    const document: User = {
      _id: "user_1",
      createdAt: new Date(),
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      updatedAt: new Date(),
    };
    const repository = {
      deleteById: vi.fn(async () => undefined),
      findById: vi.fn(async () => document),
      updateById: vi.fn(async (_id: string, patch: unknown) => ({
        ...document,
        ...(patch as Partial<User>),
      })),
    };
    const record = createActiveRecord(document, repository, {
      collectionName: "users",
    });

    await expect(record.$reload()).resolves.toBe(record);
    await expect(record.$update({ name: "Grace" })).resolves.toBe(record);
    expect(record.name).toBe("Grace");
    expect(record.$toObject()).toMatchObject({ _id: "user_1", name: "Grace" });
    expect(Object.keys(record.$toObject())).not.toContain("$save");

    await record.$delete();
    expect(repository.deleteById).toHaveBeenCalledWith("user_1");
  });

  it("throws clear active-record errors for unsupported repository methods", async () => {
    type User = InferDocument<typeof users>;
    const document: User = {
      _id: "user_1",
      createdAt: new Date(),
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      updatedAt: new Date(),
    };
    const record = createActiveRecord(document, {
      async findById(id: string) {
        return id === document._id ? document : null;
      },
    });

    await expect(record.$update({ name: "Grace" })).rejects.toMatchObject({
      code: "TYPED_MONGO_ACTIVE_RECORD_UNSUPPORTED",
    });
    await expect(record.$delete()).rejects.toBeInstanceOf(TypedMongoError);
  });

  it("keeps typed not-found errors inspectable", () => {
    const error = new TypedMongoNotFoundError({
      collectionName: "users",
      id: "user_404",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("TYPED_MONGO_NOT_FOUND");
    expect(error.message).toContain("users");
  });

  it("exports the public API", () => {
    expect(publicApi.defineCollection).toBeTypeOf("function");
    expect(publicApi.createCollectionRegistry).toBeTypeOf("function");
    expect(publicApi.createActiveRecord).toBeTypeOf("function");
    expect(publicApi.createActiveRecordCollection).toBeTypeOf("function");
    expect(publicApi.createEntityManager).toBeTypeOf("function");
    expect(publicApi.getDocumentById).toBeTypeOf("function");
    expect(publicApi.initAR).toBeTypeOf("function");
    expect(publicApi.initRepository).toBeTypeOf("function");
    expect(publicApi.TypedMongoNotFoundError).toBeTypeOf("function");
  });
});
