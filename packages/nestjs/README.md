# @typed-mongo/nestjs

NestJS helpers for repository injection and get-by-id pipes.

```ts
import {
  InjectTypedMongoRepository,
  TypedMongoModule,
  type TypedMongoRepository,
} from "@typed-mongo/nestjs";

@Module({
  imports: [TypedMongoModule.forRepositories({ users: UserRepository })],
})
export class UsersModule {}

export class UsersController {
  constructor(
    @InjectTypedMongoRepository("users")
    private readonly users: TypedMongoRepository<UserDocument>,
  ) {}
}
```

## forRoot And forFeature

Use `forRoot` with a repository factory when you want `@typed-mongo/nestjs` to
create repository providers from collection definitions.

```ts
@Module({
  imports: [
    TypedMongoModule.forRoot({
      global: true,
      repositoryFactory: (collection) => initRepository(collection),
    }),
  ],
})
export class AppModule {}

@Module({
  imports: [TypedMongoModule.forFeature([usersCollection])],
})
export class UsersModule {}
```

`forRoot({ collections, repositoryFactory })` creates providers for all supplied
collections immediately. `forFeature([collection])` creates feature-scoped
providers by using the root repository factory token.

`createGetByIdPipe` loads a document through a repository and maps
`TypedMongoNotFoundError` to NestJS `NotFoundException`.
