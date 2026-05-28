# @typed-mongo/fastify

Fastify preHandler helper for loading a document by id from route params.

```ts
import { createGetByIdPreHandler } from "@typed-mongo/fastify";

fastify.get("/users/:id", {
  preHandler: createGetByIdPreHandler({
    param: "id",
    repository: UserRepository,
    attachTo: "user",
  }),
});
```

The preHandler attaches the document to `request[attachTo]`. Missing documents
throw `TypedMongoNotFoundError` by default; set `notFound: "reply"` to send a
404 JSON response directly.
