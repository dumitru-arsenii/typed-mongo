# Getting Started

`typed-mongo` starts with a Zod schema. The schema is the source of truth for
runtime validation and TypeScript inference.

```ts
import { z } from "zod";
import { defineCollection, initAR, initRepository } from "@typed-mongo/core";

export const usersCollection = defineCollection({
  name: "users",
  schema: z.object({
    _id: z.string(),
    email: z.string().email(),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
});
```

The collection object exposes:

- `name`
- `schema`
- normalized `indexes`
- `parse(input)`
- `safeParse(input)`

Use `InferDocument<typeof usersCollection>` to infer the stored document type and
`InferInsertDocument<typeof usersCollection>` to infer the Zod input type.

Next, initialize the repository and active record facade:

```ts
export const UserRepository = initRepository(usersCollection);
export const User = initAR(usersCollection);
```

`UserRepository` gives you `findOne`, `findMany`, `insertOne`, `updateMany`, and
other repository methods. `User` gives you `byId`, `findOne`, `findMany`, and
entities with `save()` / `delete()`.

See [usage-styles.md](./usage-styles.md).
