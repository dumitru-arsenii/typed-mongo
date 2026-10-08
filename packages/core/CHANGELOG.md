# @typed-mongo/core

## 0.1.6

### Patch Changes

- Require branded Typed Mongo entities in repository and ActiveRecord APIs, and keep adapter repository types aligned with the stricter Core contracts.

## 0.1.5

### Patch Changes

- Inject typed-mongo identity fields when parsing Zod discriminated-union entity documents.
- Treat `id` as a generated repository key, alongside `_id` and timestamps.
- No application-side `id` field or database migration is required.

## 0.1.1

### Patch Changes

- Require identity values and normalize MongoDB ObjectId identities to strings.
- Updated dependencies
  - @typed-mongo/zod@0.0.3

## 0.1.0

### Minor Changes

- c3861c2: Introduce the native MongoDB driver entity manager API with connection helpers, repositories, ActiveRecord support, transactions, Zod validation, and index syncing. Update framework adapters to consume the new repository API.

### Patch Changes

- Include Zod issue details (field path and message) in the `TypedMongoValidationError` message, instead of only the generic collection name.
