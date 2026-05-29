# @typed-mongo/core

Zod-first MongoDB document layer built directly on the official MongoDB Node.js
driver.

## Installation

```sh
npm install @typed-mongo/core mongodb zod
```

## Define Entity

```ts
import { createMongoEntity, mongoId, timestamps } from "@typed-mongo/core";
import { z } from "zod";

export const UserEntity = createMongoEntity({
  collection: "users",
  schema: z.object({
    _id: mongoId().optional(),
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(["admin", "user"]).default("user"),
    ...timestamps(),
  }),
  indexes: [
    {
      keys: { email: 1 },
      unique: true,
    },
  ],
});
```

## Connect Once

```ts
import { connectMongo, disconnectMongo } from "@typed-mongo/core";

await connectMongo({
  uri: process.env.MONGO_URI!,
  database: process.env.MONGO_DATABASE!,
});

await disconnectMongo();
```

`connectMongo(...)` stores the internal MongoDB connection used by the exported
singleton `entityManager`. Operations are not buffered. If no connection exists,
`entityManager` throws `TypedMongoConnectionError` immediately:

```txt
No MongoDB connection associated. Call connectMongo(...) before using entityManager.
```

## Repository

Repository is the primary API.

```ts
import { entityManager } from "@typed-mongo/core";

const users = entityManager.repo(UserEntity);

const user = await users.create({
  email: "john@example.com",
  name: "John",
});

const found = await users.findById(user._id);
```

Repositories validate data with the entity Zod schema before inserts and after
updates. They use native MongoDB filters and options, return parsed documents,
and pass sessions to driver operations inside transactions.

## ActiveRecord

ActiveRecord is a convenience layer over Repository.

```ts
const User = entityManager.active(UserEntity);

const user = await User.create({
  email: "john@example.com",
  name: "John",
});

user.data.name = "Johnny";

await user.save();
await user.reload();
await user.delete();
```

## Transaction

EntityManager is the orchestration API.

```ts
await entityManager.transaction(async (tx) => {
  const user = await tx.repo(UserEntity).create({
    email: "john@example.com",
    name: "John",
  });

  await tx.repo(ProfileEntity).create({
    userId: user._id,
    displayName: user.name,
  });
});
```

Transactions use the native driver `ClientSession` and `withTransaction` APIs.
Nested transactions are not supported yet.

## Sync Indexes

```ts
import { syncIndexes } from "@typed-mongo/core";

await syncIndexes([UserEntity, PostEntity]);
await entityManager.syncIndexes([UserEntity, PostEntity]);
```

## Architecture

- `connectMongo(...)` is responsible for setting the internal connection.
- The exported singleton `entityManager` is the default public API.
- You do not pass `db` to every repository call.
- The package never silently creates connections.
- The package never buffers operations before connection.
- Multi-tenant and named connections are intentionally left for a later version.
