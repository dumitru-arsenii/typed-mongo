import { expect, test } from "vitest";
import { z } from "zod";

import { identity, isIdentitySchema } from "../src";

test("identity requires a string", () => {
  expect(identity().safeParse(undefined).success).toBe(false);
  expect(identity().safeParse(null).success).toBe(false);
  expect(identity().parse("507f1f77bcf86cd799439011")).toBe(
    "507f1f77bcf86cd799439011",
  );
});

test("identity converts Mongo ObjectId instances to strings", () => {
  class ObjectId {
    toString() {
      return "507f1f77bcf86cd799439011";
    }
  }

  expect(identity().parse(new ObjectId())).toBe("507f1f77bcf86cd799439011");
});

test("identity rejects ObjectId-shaped values without toString", () => {
  const objectIdPrototype = Object.create(null) as {
    constructor: { name: string };
  };
  objectIdPrototype.constructor = { name: "ObjectId" };
  const objectIdWithoutToString = Object.create(objectIdPrototype);

  expect(identity().safeParse(objectIdWithoutToString).success).toBe(false);
});

test("identity fields cannot be omitted", () => {
  const schema = z.object({ userId: identity() });

  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ userId: undefined }).success).toBe(false);
});

test("identity can still be explicitly optional", () => {
  const schema = z.object({ userId: identity().optional() });

  expect(schema.safeParse({}).success).toBe(true);
});

test("identity schemas remain detectable", () => {
  const schema = identity();

  expect(isIdentitySchema(schema)).toBe(true);
});
