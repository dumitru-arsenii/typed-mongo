export interface TypedMongoRepositoryHooks<TDocument, TPatch = unknown> {
  afterDeleteById?(id: unknown): void | Promise<void>;
  afterInsert?(document: TDocument): void | Promise<void>;
  afterUpdateById?(document: TDocument, patch: TPatch): void | Promise<void>;
  afterValidate?(document: TDocument): void | Promise<void>;
  beforeDeleteById?(id: unknown): void | Promise<void>;
  beforeInsert?(document: TDocument): void | Promise<void>;
  beforeUpdateById?(id: unknown, patch: TPatch): void | Promise<void>;
  beforeValidate?(input: unknown): void | Promise<void>;
}
