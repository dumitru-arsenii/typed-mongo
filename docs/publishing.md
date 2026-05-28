# Publishing

This repository uses Changesets for versioning and npm publishing.

1. Make changes.
2. Run `pnpm changeset`.
3. Merge the changeset to `main`.
4. The release workflow opens a version PR.
5. Merging the version PR publishes public packages to npm.

Each package is ESM-first, publishes files from `dist`, includes source maps and
type declarations, and sets `publishConfig.access` to `public`.
