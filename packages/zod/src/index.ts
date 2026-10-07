import { z } from "zod";

const identitySchemas = new WeakSet<object>();

type ObjectIdLike = {
  toString(): string;
};

export function identity() {
  const schema = z
    .union([z.string(), z.custom<ObjectIdLike>(isObjectId)])
    .transform((value) => (typeof value === "string" ? value : value.toString()));

  identitySchemas.add(schema);
  return schema;
}

function isObjectId(value: unknown): value is ObjectIdLike {
  if (typeof value !== "object" || value === null) return false;

  return (
    Object.getPrototypeOf(value)?.constructor?.name === "ObjectId" &&
    typeof (value as ObjectIdLike).toString === "function"
  );
}

export function isIdentitySchema(schema: unknown): boolean {
  return (
    typeof schema === "object" &&
    schema !== null &&
    identitySchemas.has(schema as object)
  );
}

export function timestamps() {
  return {
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  };
}
