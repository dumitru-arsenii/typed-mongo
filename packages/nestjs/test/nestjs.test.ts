import { NotFoundException } from "@nestjs/common";
import type { MongoEntity } from "@typed-mongo/core";
import { describe, expect, it, vi } from "vitest";

import {
  createGetByIdPipe,
  createTypedMongoRepositoryProvider,
  getTypedMongoRepositoryToken,
  InjectTypedMongoRepository,
  TYPED_MONGO_REPOSITORY_FACTORY,
  TypedMongoGetByIdPipe,
  TypedMongoModule,
} from "../src";

interface User {
  _id: string;
  email: string;
}

const users = { collection: "users" } as MongoEntity;

describe("@typed-mongo/nestjs", () => {
  it("creates stable repository injection tokens", () => {
    expect(getTypedMongoRepositoryToken("users")).toBe("typed-mongo:users:repository");
  });

  it("creates repository providers and decorators", () => {
    const repository = {
      findById: vi.fn(async () => null),
    };
    const provider = createTypedMongoRepositoryProvider("users", repository);

    expect(provider).toMatchObject({
      provide: "typed-mongo:users:repository",
      useValue: repository,
    });
    expect(InjectTypedMongoRepository("users")).toBeTypeOf("function");
  });

  it("creates a module with repository providers", () => {
    const repository = {
      async findById() {
        return null;
      },
    };

    expect(TypedMongoModule.forRepositories({ users: repository })).toMatchObject({
      exports: ["typed-mongo:users:repository"],
      providers: [
        {
          provide: "typed-mongo:users:repository",
          useValue: repository,
        },
      ],
    });
  });

  it("creates root repository providers from collections and a factory", async () => {
    const repository = {
      async findById() {
        return null;
      },
    };
    const repositoryFactory = vi.fn(() => repository);

    const module = TypedMongoModule.forRoot({
      collections: [users],
      global: true,
      repositoryFactory,
    });
    const repositoryProvider = module.providers?.find(
      (provider) =>
        typeof provider === "object" &&
        "provide" in provider &&
        provider.provide === "typed-mongo:users:repository",
    ) as { useFactory: () => unknown };

    expect(module.global).toBe(true);
    expect(module.exports).toContain(TYPED_MONGO_REPOSITORY_FACTORY);
    expect(module.exports).toContain("typed-mongo:users:repository");
    await expect(Promise.resolve(repositoryProvider.useFactory())).resolves.toBe(
      repository,
    );
    expect(repositoryFactory).toHaveBeenCalledWith(users);
  });

  it("creates feature repository providers from the root factory token", async () => {
    const repository = {
      async findById() {
        return null;
      },
    };
    const repositoryFactory = vi.fn(() => repository);

    const module = TypedMongoModule.forFeature([users]);
    const repositoryProvider = module.providers?.find(
      (provider) =>
        typeof provider === "object" &&
        "provide" in provider &&
        provider.provide === "typed-mongo:users:repository",
    ) as {
      inject: unknown[];
      useFactory: (factory: typeof repositoryFactory) => unknown;
    };

    expect(repositoryProvider.inject).toEqual([TYPED_MONGO_REPOSITORY_FACTORY]);
    await expect(
      Promise.resolve(repositoryProvider.useFactory(repositoryFactory)),
    ).resolves.toBe(repository);
    expect(module.exports).toContain("typed-mongo:users:repository");
  });

  it("loads documents with the get-by-id pipe", async () => {
    const user: User = { _id: "user_1", email: "ada@example.com" };
    const repository = {
      findById: vi.fn(async () => user),
    };
    const pipe = createGetByIdPipe({
      mapId: (value) => String(value),
      repository,
    });

    await expect(
      pipe.transform("user_1", { data: "id", metatype: String, type: "param" }),
    ).resolves.toBe(user);
    expect(repository.findById).toHaveBeenCalledWith("user_1");
  });

  it("maps typed not-found errors to NestJS NotFoundException", async () => {
    const repository = {
      findById: vi.fn(async () => null),
    };
    const pipe = new TypedMongoGetByIdPipe<User>({
      collectionName: "users",
      repository,
    });

    await expect(
      pipe.transform("missing", {
        data: "id",
        metatype: String,
        type: "param",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
