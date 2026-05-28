# Usage Styles

`@typed-mongo/core` is easiest to understand as three named objects:

- `usersCollection`: collection reference, schema, indexes, parse helpers.
- `UserRepository`: query/write repository.
- `User`: active record facade that returns entities with `save()` and
  `delete()`.

## Collection Reference

```ts
const usersCollection = defineCollection({
  name: "users",
  schema,
  indexes: [{ keys: { email: 1 }, unique: true }],
});

usersCollection.parse(input);
usersCollection.safeParse(input);
```

The collection reference does not perform database work.

## Repository

Use repositories when you want explicit query/write operations.

```ts
const UserRepository = initRepository(usersCollection);

const user = await UserRepository.findOne({ _id: "user_1" });
await UserRepository.insertOne(document);
await UserRepository.updateMany({ role: "admin" }, { role: "user" });
```

`initRepository(collection)` creates an in-memory repository by default. For
production, pass an adapter that delegates to the MongoDB driver or your data
layer.

## Active Record

```ts
const User = initAR(usersCollection);

const userById = await User.byId("user_1");
const firstAdmin = await User.findOne({ role: "admin" });
const admins = await User.findMany({ role: "admin" });

const userEntity = User.create(document);

userEntity.name = "Grace Hopper";
await userEntity.save();
await userEntity.delete();
```

Entities returned from `byId`, `findOne`, and `findMany` are active records too.
`save()` compares the current document to its last persisted snapshot and calls
`updateById(id, changes)` with only changed top-level fields. For example,
changing `name` and `updatedAt` sends `{ name, updatedAt }`, not the full
document.

Active records do not add database behavior by themselves; they call methods on
the repository you provide. If a repository does not implement a method such as
`updateById`, the active record throws a typed `TypedMongoError`.

## Entity Manager

Use an entity manager when a service needs multiple collection active records by
name. The manager intentionally receives collection active records, not raw
repositories.

```ts
import { createEntityManager } from "@typed-mongo/core";

const User = initAR(usersCollection);
const Session = initAR(sessionsCollection);

const manager = createEntityManager({
  users: User,
  sessions: Session,
});

const user = await manager.getById("users", "user_1");
const session = await manager.findById("sessions", "session_1");
```
