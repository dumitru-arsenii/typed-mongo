import { z } from "zod";

const identitySchemas = new WeakSet<object>();

export function identity() {
  const schema = z.string().transform((value) => value);

  identitySchemas.add(schema);
  return schema;
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
