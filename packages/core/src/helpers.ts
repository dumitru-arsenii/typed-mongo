import type z from "zod";
import type { MongoDiscriminatedEntity, MongoDiscriminatedVariants } from "./entity";
import type { Repository } from "./repository";
import type { ObjectId } from "mongodb";
import type { ActiveRecordModel } from "./active-record";

export type MongoDiscriminatedCollection<
  TSchema extends z.ZodDiscriminatedUnion<any, any>,
> = MongoDiscriminatedEntity<TSchema, MongoDiscriminatedVariants<TSchema>>;

export type RepositoryLike<TSchema extends z.ZodTypeAny> = Repository<
  z.infer<TSchema> & { _id: ObjectId }
>;

export type ActiveRecordLike<TSchema extends z.ZodTypeAny> = ActiveRecordModel<
  z.infer<TSchema> & { _id: ObjectId }
>;
