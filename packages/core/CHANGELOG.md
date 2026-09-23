# @typed-mongo/core

## 0.1.0

### Minor Changes

- c3861c2: Introduce the native MongoDB driver entity manager API with connection helpers, repositories, ActiveRecord support, transactions, Zod validation, and index syncing. Update framework adapters to consume the new repository API.

### Patch Changes

- Include Zod issue details (field path and message) in the `TypedMongoValidationError` message, instead of only the generic collection name.
