# Roadmap

## Implemented

- Zod-first collection definitions
- Runtime document validation helpers
- Type inference helpers for documents, insert input, and update patches
- Index definition metadata and name normalization
- Collection registry
- Repository contracts, collection active-record helpers, entity manager helpers,
  dirty-change active-record saves, and get-by-id helper functions
- Typed validation and not-found errors
- Express get-by-id middleware
- Fastify get-by-id preHandler
- NestJS repository injection helpers and get-by-id pipe
- NestJS `forRoot` and `forFeature` repository provider helpers

## Experimental

- Hook interfaces in `@typed-mongo/core` are type-level contracts only. They are
  present so repository implementations can share vocabulary, but core does not
  execute hooks.

## Planned

- A first-party MongoDB driver repository implementation
- More granular update schema helpers
- Pagination helper contracts
- Optional index synchronization utilities

## Not Implemented Yet

- A MongoDB adapter package
- tRPC or oRPC packages
- Dashboard, CLI, React, or other UI packages
- Full ORM behavior such as relations, migrations, sessions, or query builders
