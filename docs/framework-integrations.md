# Framework Integrations

The framework packages focus on one practical integration point: loading a
document by id from route parameters.

## Express

`createGetByIdMiddleware` reads `req.params[param]`, calls `getById` or
`findById`, and attaches the document to both `req[attachTo]` and
`res.locals[attachTo]` by default.

Use `notFound: "response"` to send a JSON 404 response. By default, a
`TypedMongoNotFoundError` is passed to `next(error)`.

## Fastify

`createGetByIdPreHandler` reads `request.params[param]`, calls `getById` or
`findById`, and attaches the document to `request[attachTo]`.

Use `notFound: "reply"` to send a JSON 404 response. By default, the typed
not-found error is thrown so your Fastify error handler can format it.

## NestJS

The NestJS package includes:

- `getTypedMongoRepositoryToken(collectionName)`
- `InjectTypedMongoRepository(collectionName)`
- `createTypedMongoRepositoryProvider(collectionName, repository)`
- `TypedMongoModule.forRoot({ repositoryFactory })`
- `TypedMongoModule.forFeature([collection])`
- `TypedMongoModule.forRepositories({ ... })`
- `createGetByIdPipe({ repository })`

`forRoot({ collections, repositoryFactory })` creates repository providers for
all supplied collections. A simple factory can return `initRepository(collection)`;
production apps can return repositories backed by their own adapter. `forFeature`
creates feature-scoped providers by injecting the root repository factory token.

The get-by-id pipe maps `TypedMongoNotFoundError` to NestJS
`NotFoundException`.
