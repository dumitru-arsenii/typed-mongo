# @typed-mongo/core

Framework-agnostic primitives for `typed-mongo`.

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
  }),
});

export type UserDocument = InferDocument<typeof usersCollection>;
```

Includes collection definitions, runtime validation helpers, index metadata,
collection registries, repository contracts, entity manager helpers, active
record helpers, hook interfaces, and typed errors.

## Collection Reference

```ts
usersCollection.parse(input);
usersCollection.safeParse(input);
```

## Repository

```ts
const UserRepository = initRepository(usersCollection);

await UserRepository.insertOne(document);
const user = await UserRepository.findOne({ _id: "user_1" });
await UserRepository.updateMany({ role: "admin" }, { role: "user" });
```

`initRepository(collection)` uses an in-memory adapter by default. Pass a custom
adapter for production persistence.

## Active Record

```ts
const User = initAR(usersCollection);

const user = await User.byId("user_1");

user.email = "ada@example.com";
await user.save();
```

`save()` compares the current document to the last persisted snapshot and calls
`updateById` with only changed top-level fields.

## Entity Manager

```ts
import { createEntityManager } from "@typed-mongo/core";

const manager = createEntityManager({
  users: User,
});

const user = await manager.getById("users", "user_1");
await user.delete();
```

The active record and entity manager call repositories initialized for your
collection. They do not create a MongoDB connection or hide a driver adapter.
