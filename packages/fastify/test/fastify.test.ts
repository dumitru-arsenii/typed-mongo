import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { createGetByIdPreHandler } from "../src";

interface User {
  _id: string;
  email: string;
}

function createReply() {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn(async () => undefined),
  } as unknown as FastifyReply & {
    code: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

async function runPreHandler(
  preHandler: ReturnType<typeof createGetByIdPreHandler>,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return (preHandler as any)(request, reply, vi.fn());
}

describe("@typed-mongo/fastify", () => {
  it("reads an id from params, calls the repository, and attaches the document", async () => {
    const user: User = { _id: "user_1", email: "ada@example.com" };
    const repository = {
      findById: vi.fn(async () => user),
    };
    const preHandler = createGetByIdPreHandler({
      attachTo: "user",
      param: "id",
      repository,
    });
    const request = { params: { id: "user_1" } } as FastifyRequest &
      Record<string, unknown>;
    const reply = createReply();

    await runPreHandler(preHandler, request, reply);

    expect(repository.findById).toHaveBeenCalledWith("user_1");
    expect(request.user).toBe(user);
  });

  it("throws typed not-found errors by default", async () => {
    const repository = {
      findById: vi.fn(async () => null),
    };
    const preHandler = createGetByIdPreHandler<User>({
      attachTo: "user",
      collectionName: "users",
      param: "id",
      repository,
    });
    const request = { params: { id: "missing" } } as FastifyRequest;
    const reply = createReply();

    await expect(runPreHandler(preHandler, request, reply)).rejects.toMatchObject({
      name: "TypedMongoNotFoundError",
    });
  });

  it("can reply with 404 for missing documents", async () => {
    const repository = {
      findById: vi.fn(async () => null),
    };
    const preHandler = createGetByIdPreHandler<User>({
      attachTo: "user",
      notFound: "reply",
      param: "id",
      repository,
    });
    const request = { params: { id: "missing" } } as FastifyRequest;
    const reply = createReply();

    await runPreHandler(preHandler, request, reply);

    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Not Found", statusCode: 404 }),
    );
  });

  it("propagates repository errors", async () => {
    const error = new Error("database offline");
    const repository = {
      findById: vi.fn(async () => {
        throw error;
      }),
    };
    const preHandler = createGetByIdPreHandler<User>({
      attachTo: "user",
      param: "id",
      repository,
    });
    const request = { params: { id: "user_1" } } as FastifyRequest;
    const reply = createReply();

    await expect(runPreHandler(preHandler, request, reply)).rejects.toBe(error);
  });
});
