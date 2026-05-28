import {
  Inject,
  Module,
  NotFoundException,
  type ArgumentMetadata,
  type DynamicModule,
  type PipeTransform,
  type Provider,
} from "@nestjs/common";
import {
  getDocumentById,
  TypedMongoNotFoundError,
  type AnyTypedMongoCollection,
  type TypedMongoGetByIdCapableRepository,
  type TypedMongoRepository,
} from "@typed-mongo/core";

export type { TypedMongoRepository } from "@typed-mongo/core";

export const TYPED_MONGO_REPOSITORY_FACTORY = Symbol.for(
  "@typed-mongo/nestjs:repository-factory",
);

export type TypedMongoRepositoryRecord = Record<string, TypedMongoRepository<any, any>>;

export type TypedMongoNestRepositoryFactory = (
  collection: AnyTypedMongoCollection,
) => Promise<TypedMongoRepository<any, any>> | TypedMongoRepository<any, any>;

export interface TypedMongoRootModuleOptions {
  collections?: readonly AnyTypedMongoCollection[] | undefined;
  global?: boolean | undefined;
  repositories?: TypedMongoRepositoryRecord | undefined;
  repositoryFactory?: TypedMongoNestRepositoryFactory | undefined;
}

export interface TypedMongoFeatureModuleOptions {
  collections?: readonly AnyTypedMongoCollection[] | undefined;
  repositories?: TypedMongoRepositoryRecord | undefined;
  repositoryFactory?: TypedMongoNestRepositoryFactory | undefined;
}

export function getTypedMongoRepositoryToken(collectionName: string): string {
  return `typed-mongo:${collectionName}:repository`;
}

export function InjectTypedMongoRepository(
  collectionName: string,
): ReturnType<typeof Inject> {
  return Inject(getTypedMongoRepositoryToken(collectionName));
}

export function createTypedMongoRepositoryProvider<TDocument, TId = string>(
  collectionName: string,
  repository: TypedMongoRepository<TDocument, TId>,
): Provider {
  return {
    provide: getTypedMongoRepositoryToken(collectionName),
    useValue: repository,
  };
}

export function createTypedMongoRepositoryFactoryProvider(
  repositoryFactory: TypedMongoNestRepositoryFactory,
): Provider {
  return {
    provide: TYPED_MONGO_REPOSITORY_FACTORY,
    useValue: repositoryFactory,
  };
}

export interface CreateGetByIdPipeOptions<TDocument, TId = string> {
  collectionName?: string;
  mapId?: (value: unknown, metadata: ArgumentMetadata) => TId | Promise<TId>;
  notFoundMessage?: string;
  repository: TypedMongoGetByIdCapableRepository<TDocument, TId>;
}

export class TypedMongoGetByIdPipe<TDocument, TId = string> implements PipeTransform<
  unknown,
  Promise<TDocument>
> {
  constructor(private readonly options: CreateGetByIdPipeOptions<TDocument, TId>) {}

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<TDocument> {
    try {
      const id = this.options.mapId
        ? await this.options.mapId(value, metadata)
        : (value as TId);

      return await getDocumentById(this.options.repository, id, {
        collectionName: this.options.collectionName,
      });
    } catch (error) {
      if (error instanceof TypedMongoNotFoundError) {
        throw new NotFoundException(this.options.notFoundMessage ?? error.message);
      }

      throw error;
    }
  }
}

export function createGetByIdPipe<TDocument, TId = string>(
  options: CreateGetByIdPipeOptions<TDocument, TId>,
): PipeTransform<unknown, Promise<TDocument>> {
  return new TypedMongoGetByIdPipe(options);
}

@Module({})
export class TypedMongoModule {
  static forRoot(options: TypedMongoRootModuleOptions = {}): DynamicModule {
    const factoryProviders =
      options.repositoryFactory === undefined
        ? []
        : [createTypedMongoRepositoryFactoryProvider(options.repositoryFactory)];
    const repositoryProviders = [
      ...createProvidersFromRepositoryRecord(options.repositories),
      ...createProvidersFromCollections(options.collections, {
        repositoryFactory: options.repositoryFactory,
        useInjectedFactory: false,
      }),
    ];

    const module: DynamicModule = {
      exports: [
        ...providerTokens(factoryProviders),
        ...providerTokens(repositoryProviders),
      ],
      module: TypedMongoModule,
      providers: [...factoryProviders, ...repositoryProviders],
    };

    if (options.global !== undefined) {
      module.global = options.global;
    }

    return module;
  }

  static forFeature(
    input: readonly AnyTypedMongoCollection[] | TypedMongoFeatureModuleOptions = {},
  ): DynamicModule {
    const options: TypedMongoFeatureModuleOptions = Array.isArray(input)
      ? { collections: input as readonly AnyTypedMongoCollection[] }
      : (input as TypedMongoFeatureModuleOptions);
    const repositoryProviders = [
      ...createProvidersFromRepositoryRecord(options.repositories),
      ...createProvidersFromCollections(options.collections, {
        repositoryFactory: options.repositoryFactory,
        useInjectedFactory: options.repositoryFactory === undefined,
      }),
    ];

    return {
      exports: providerTokens(repositoryProviders),
      module: TypedMongoModule,
      providers: repositoryProviders,
    };
  }

  static forRepositories(repositories: TypedMongoRepositoryRecord): DynamicModule {
    return TypedMongoModule.forRoot({ repositories });
  }
}

interface CreateProvidersFromCollectionsOptions {
  repositoryFactory?: TypedMongoNestRepositoryFactory | undefined;
  useInjectedFactory: boolean;
}

function createProvidersFromCollections(
  collections: readonly AnyTypedMongoCollection[] = [],
  options: CreateProvidersFromCollectionsOptions,
): Provider[] {
  if (collections.length > 0 && !options.useInjectedFactory) {
    assertRepositoryFactory(options.repositoryFactory);
  }

  return collections.map((collection) => ({
    inject: options.useInjectedFactory ? [TYPED_MONGO_REPOSITORY_FACTORY] : [],
    provide: getTypedMongoRepositoryToken(collection.name),
    useFactory: (repositoryFactory?: TypedMongoNestRepositoryFactory) => {
      const factory = options.repositoryFactory ?? repositoryFactory;

      assertRepositoryFactory(factory);
      return factory(collection);
    },
  }));
}

function createProvidersFromRepositoryRecord(
  repositories: TypedMongoRepositoryRecord = {},
): Provider[] {
  return Object.entries(repositories).map(([collectionName, repository]) =>
    createTypedMongoRepositoryProvider(collectionName, repository),
  );
}

function assertRepositoryFactory(
  repositoryFactory: TypedMongoNestRepositoryFactory | undefined,
): asserts repositoryFactory is TypedMongoNestRepositoryFactory {
  if (repositoryFactory === undefined) {
    throw new Error(
      "TypedMongoModule requires a repositoryFactory to create repositories from collections.",
    );
  }
}

function providerTokens(providers: Provider[]): Array<string | symbol> {
  return providers.flatMap((provider) => {
    if (typeof provider !== "object" || !("provide" in provider)) {
      return [];
    }

    return typeof provider.provide === "string" || typeof provider.provide === "symbol"
      ? [provider.provide]
      : [];
  });
}
