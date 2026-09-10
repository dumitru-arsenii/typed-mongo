import { z } from "zod";

const identitySchemas = new WeakSet<object>();

export function identity() {
  const schema = z
    .string()
    .optional()
    .transform((value) => value as string);

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
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  };
}
