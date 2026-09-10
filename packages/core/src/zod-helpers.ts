import { ObjectId } from "mongodb";
import { z } from "zod";

export function mongoId() {
  return z.union([
    z.instanceof(ObjectId),
    z
      .string()
      .refine((value) => ObjectId.isValid(value), {
        message: "Invalid ObjectId",
      })
      .transform((value) => new ObjectId(value)),
  ]);
}
