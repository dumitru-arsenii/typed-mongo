# typed-mongo

Zod-first MongoDB collection definitions, validation helpers, and lightweight
repository integration helpers.

`typed-mongo` is intentionally small. It helps you define collection metadata with
Zod, infer TypeScript document types, validate documents at runtime, describe
indexes, and reuse the same repository contract in Express, Fastify, and NestJS.
It is not a MongoDB driver wrapper or a full ORM.

## Packages

Only these packages are part of this monorepo:

- `@typed-mongo/core`
- `@typed-mongo/express`
- `@typed-mongo/fastify`
- `@typed-mongo/nestjs`

## Installation

```bash
pnpm add zod @typed-mongo/core
pnpm add @typed-mongo/express
pnpm add @typed-mongo/fastify
pnpm add @typed-mongo/nestjs
```

Install only the framework package you use.

## The Three Objects

typed-mongo is clearest when you name the three layers separately:

- `usersCollection`: schema, indexes, and validation.
- `UserRepository`: query/write API.
- `User`: active record API that returns entities with `save()` and `delete()`.

```ts
import { z } from "zod";
import {
  defineCollection,
  initAR,
  initRepository,
  type InferDocument,
} from "@typed-mongo/core";

export const usersCollection = defineCollection({
  name: "users",
  schema: z.object({
    _id: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(["admin", "user"]),
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
  indexes: [{ keys: { email: 1 }, unique: true }],
});

export type UserDocument = InferDocument<typeof usersCollection>;
```

## Collection Reference

`usersCollection` does not talk to the database. It is the typed collection
reference: schema, index metadata, and runtime validation.

```ts
const user = usersCollection.parse(input);
const result = usersCollection.safeParse(input);
```

Invalid documents throw `TypedMongoValidationError` from `@typed-mongo/core`.

## Repository

`UserRepository` is the query/write layer. `initRepository(usersCollection)`
creates a working in-memory repository, which is useful for tests, examples, and
local state. For production persistence, pass an adapter backed by the MongoDB
driver or your data layer.

```ts
export const UserRepository = initRepository(usersCollection);

const user = await UserRepository.findOne({ _id: "user_1" });
const users = await UserRepository.findMany({ role: "admin" });

await UserRepository.insertOne({
  _id: "user_1",
  email: "ada@example.com",
  name: "Ada",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
});

await UserRepository.updateMany({ role: "admin" }, { role: "user" });
```

Repository methods include `findOne`, `findMany`, `findById`, `getById`,
`insertOne`, `insertMany`, `updateOne`, `updateMany`, `updateById`,
`deleteOne`, `deleteMany`, `deleteById`, and `count`.

## Active Record

`User` is the active record facade. It reuses the initialized repository for the
same collection.

```ts
export const User = initAR(usersCollection);

const userById = await User.byId("user_1");
const firstAdmin = await User.findOne({ role: "admin" });
const admins = await User.findMany({ role: "admin" });
```

Active record entities track local changes:

```ts
const userEntity = User.create({
  _id: "user_2",
  email: "grace@example.com",
  name: "Grace",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
});

userEntity.name = "Grace Hopper";

await userEntity.save(); // inserts the new document
await userEntity.delete();
```

Entities returned from `User.byId`, `User.findOne`, and `User.findMany` are
already persisted. If you change one and call `save()`, typed-mongo sends only
the changed top-level fields:

```ts
const user = await User.byId("user_1");

user.name = "Ada Lovelace";
await user.save(); // calls updateById("user_1", { name: "Ada Lovelace" })
await user.reload();
await user.delete();
```

Dollar-prefixed aliases are also available: `$save`, `$delete`, `$reload`,
`$update`, `$changes`, `$isDirty`, and `$toObject`.

## Framework Helpers

Express:

```ts
import { createGetByIdMiddleware } from "@typed-mongo/express";

app.get(
  "/users/:id",
  createGetByIdMiddleware({
    param: "id",
    repository: UserRepository,
    attachTo: "user",
  }),
  (req, res) => res.json(req.user),
);
```

Fastify:

```ts
import { createGetByIdPreHandler } from "@typed-mongo/fastify";

fastify.get(
  "/users/:id",
  {
    preHandler: createGetByIdPreHandler({
      param: "id",
      repository: UserRepository,
      attachTo: "user",
    }),
  },
  async (request) => request.user,
);
```

NestJS:

```ts
import {
  InjectTypedMongoRepository,
  TypedMongoModule,
  type TypedMongoRepository,
} from "@typed-mongo/nestjs";

@Module({
  imports: [TypedMongoModule.forRepositories({ users: UserRepository })],
})
export class UsersModule {}

export class UsersController {
  constructor(
    @InjectTypedMongoRepository("users")
    private readonly repository: TypedMongoRepository<UserDocument>,
  ) {}
}
```

To create repository providers from collection definitions, provide a repository
factory at the root and select collections in feature modules:

```ts
@Module({
  imports: [
    TypedMongoModule.forRoot({
      global: true,
      repositoryFactory: (collection) => initRepository(collection),
    }),
  ],
})
export class AppModule {}

@Module({
  imports: [TypedMongoModule.forFeature([usersCollection])],
})
export class UsersModule {}
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Roadmap

See [docs/roadmap.md](./docs/roadmap.md).
