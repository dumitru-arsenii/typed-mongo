import { ObjectId, type IndexDescription } from "mongodb";
import { z } from "zod";

type GeneratedKeys = "_id" | "createdAt" | "updatedAt";
type StringDiscriminatorValue<TSchema extends z.ZodTypeAny, TKey extends string> =
  z.infer<TSchema> extends Record<TKey, infer TValue> ? Extract<TValue, string> : never;

export type MongoEntityIndex = Omit<IndexDescription, "key"> & {
  key?: IndexDescription["key"];
  keys?: IndexDescription["key"];
};

export type MongoEntityOptions<TSchema extends z.ZodTypeAny> = {
  collection: string;
  schema: TSchema;
  indexes?: MongoEntityIndex[];
};

export type BaseMongoEntity<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  collection: string;
  schema: TSchema;
  indexes: MongoEntityIndex[];
  parse(input: unknown): z.infer<TSchema>;
  safeParse(input: unknown): z.SafeParseReturnType<unknown, z.infer<TSchema>>;
};

export type NormalMongoEntity<TSchema extends z.ZodTypeAny = z.ZodTypeAny> =
  BaseMongoEntity<TSchema> & {
    kind?: "entity";
  };

export type MongoVariantEntity<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TDiscriminator extends string = string,
  TValue extends string = string,
> = BaseMongoEntity<TSchema> & {
  kind: "variant";
  discriminator: TDiscriminator;
  discriminatorValue: TValue;
};

export type MongoDiscriminatedEntity<
  TSchema extends z.ZodDiscriminatedUnion<any, any> = z.ZodDiscriminatedUnion<any, any>,
  TVariants extends Record<string, MongoVariantEntity<any, any, any>> = Record<
    string,
    MongoVariantEntity<any, any, any>
  >,
> = BaseMongoEntity<TSchema> & {
  kind: "discriminated";
  discriminator: string;
  variants: TVariants;
};

export type MongoEntity<TSchema extends z.ZodTypeAny = z.ZodTypeAny> =
  | NormalMongoEntity<TSchema>
  | MongoVariantEntity<TSchema>
  | MongoDiscriminatedEntity<any, any>;

export type MongoDiscriminatedVariants<
  TSchema extends z.ZodDiscriminatedUnion<any, any>,
> =
  TSchema extends z.ZodDiscriminatedUnion<infer TDiscriminator, infer TOptions>
    ? {
        [TOption in TOptions[number] as StringDiscriminatorValue<
          TOption,
          TDiscriminator
        >]: MongoVariantEntity<
          TOption,
          TDiscriminator,
          StringDiscriminatorValue<TOption, TDiscriminator>
        >;
      }
    : never;

export type EntityType<TEntity extends MongoEntity<any>> =
  TEntity extends BaseMongoEntity<infer TSchema>
    ? z.infer<TSchema> & { _id: ObjectId }
    : never;

type EntityInputType<TEntity extends MongoEntity<any>> =
  TEntity extends BaseMongoEntity<infer TSchema>
    ? z.input<TSchema> & { _id?: ObjectId }
    : never;

export type EntityInput<TEntity extends MongoEntity<any>> =
  TEntity extends MongoVariantEntity<any, infer TDiscriminator, any>
    ? VariantEntityInput<EntityInputType<TEntity>, TDiscriminator>
    : DefaultEntityInput<EntityInputType<TEntity>>;

export type EntityUpdate<TEntity extends MongoEntity<any>> =
  TEntity extends MongoVariantEntity<any, infer TDiscriminator, any>
    ? VariantEntityUpdate<EntityType<TEntity>, TDiscriminator>
    : DefaultEntityUpdate<EntityType<TEntity>>;

type DefaultEntityInput<TDocument> = TDocument extends unknown
  ? Omit<TDocument, GeneratedKeys> &
      Partial<Pick<TDocument, Extract<keyof TDocument, GeneratedKeys>>>
  : never;

type VariantEntityInput<
  TDocument,
  TDiscriminator extends string,
> = TDocument extends unknown
  ? Omit<TDocument, GeneratedKeys | TDiscriminator> &
      Partial<Pick<TDocument, Extract<keyof TDocument, GeneratedKeys>>> & {
        [TKey in TDiscriminator]?: never;
      }
  : never;

type DefaultEntityUpdate<TDocument> = Partial<
  Omit<TDocument, "_id" | "createdAt" | "updatedAt">
>;

type VariantEntityUpdate<TDocument, TDiscriminator extends string> = Partial<
  Omit<TDocument, "_id" | "createdAt" | "updatedAt" | TDiscriminator>
> & {
  [TKey in TDiscriminator]?: never;
};

export function createMongoEntity<TSchema extends z.SomeZodObject>(
  options: MongoEntityOptions<TSchema>,
): NormalMongoEntity<TSchema>;
export function createMongoEntity<TSchema extends z.ZodDiscriminatedUnion<any, any>>(
  options: MongoEntityOptions<TSchema>,
): MongoDiscriminatedEntity<TSchema, MongoDiscriminatedVariants<TSchema>>;
export function createMongoEntity<TSchema extends z.ZodTypeAny>(
  options: MongoEntityOptions<TSchema>,
): MongoEntity<TSchema> {
  if (isDiscriminatedUnion(options.schema)) {
    return createDiscriminatedEntity(
      options as unknown as MongoEntityOptions<z.ZodDiscriminatedUnion<any, any>>,
    ) as unknown as MongoEntity<TSchema>;
  }

  const entitySchema = withMongoId(options.schema as unknown as z.SomeZodObject);

  return {
    collection: options.collection,
    indexes: options.indexes ?? [],
    parse(input) {
      return entitySchema.parse(input);
    },
    safeParse(input) {
      return entitySchema.safeParse(input);
    },
    get schema() {
      return entitySchema as unknown as TSchema;
    },
  };
}

function createDiscriminatedEntity<TSchema extends z.ZodDiscriminatedUnion<any, any>>(
  options: MongoEntityOptions<TSchema>,
): MongoDiscriminatedEntity<TSchema, MongoDiscriminatedVariants<TSchema>> {
  const discriminator = options.schema.discriminator;
  const variantEntries = options.schema.options.map(
    (option: z.ZodDiscriminatedUnionOption<typeof discriminator>) => {
      const discriminatorValue = getDiscriminatorValue(option, discriminator);
      const schema = withMongoId(option);

      return [
        discriminatorValue,
        {
          kind: "variant",
          collection: options.collection,
          indexes: [],
          discriminator,
          discriminatorValue,
          parse(input: unknown) {
            return schema.parse(input);
          },
          safeParse(input: unknown) {
            return schema.safeParse(input);
          },
          get schema() {
            return schema as unknown as typeof option;
          },
        } satisfies MongoVariantEntity<typeof option, typeof discriminator, string>,
      ] as const;
    },
  );
  const variants = Object.fromEntries(
    variantEntries,
  ) as MongoDiscriminatedVariants<TSchema>;
  const entitySchema = z.discriminatedUnion(
    discriminator,
    options.schema.options.map(
      (option: z.ZodDiscriminatedUnionOption<typeof discriminator>) =>
        withMongoId(option),
    ) as [
      z.ZodDiscriminatedUnionOption<typeof discriminator>,
      ...z.ZodDiscriminatedUnionOption<typeof discriminator>[],
    ],
  );

  return {
    kind: "discriminated",
    collection: options.collection,
    indexes: options.indexes ?? [],
    discriminator,
    variants,
    parse(input) {
      return entitySchema.parse(input);
    },
    safeParse(input) {
      return entitySchema.safeParse(input);
    },
    get schema() {
      return entitySchema as unknown as TSchema;
    },
  };
}

function withMongoId<TSchema extends z.SomeZodObject>(schema: TSchema): TSchema {
  return schema.extend({
    _id: z.instanceof(ObjectId),
  }) as unknown as TSchema;
}

function isDiscriminatedUnion(
  schema: z.ZodTypeAny,
): schema is z.ZodDiscriminatedUnion<any, any> {
  return schema instanceof z.ZodDiscriminatedUnion;
}

function getDiscriminatorValue(
  schema: z.ZodDiscriminatedUnionOption<string>,
  discriminator: string,
): string {
  const discriminatorSchema = schema.shape[discriminator];

  if (!(discriminatorSchema instanceof z.ZodLiteral)) {
    throw new Error(
      `Mongo entity discriminated union requires literal discriminator "${discriminator}" values.`,
    );
  }

  if (typeof discriminatorSchema.value !== "string") {
    throw new Error(
      `Mongo entity discriminated union requires string discriminator "${discriminator}" values.`,
    );
  }

  return discriminatorSchema.value;
}
