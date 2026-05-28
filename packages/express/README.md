# @typed-mongo/express

Express middleware for loading a document by id from route params.

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

By default, the middleware attaches to both `req[attachTo]` and
`res.locals[attachTo]`, then calls `next()`. Missing documents are passed to
`next(error)` as `TypedMongoNotFoundError`; set `notFound: "response"` to send a
404 JSON response directly.
