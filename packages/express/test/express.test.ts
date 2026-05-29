import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createGetByIdMiddleware } from "../src";

interface User {
  _id: string;
  email: string;
}

function createResponse() {
  return {
    json: vi.fn(),
    locals: {},
    status: vi.fn().mockReturnThis(),
  } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

describe("@typed-mongo/express", () => {
  it("reads an id from params, calls the repository, and attaches the document", async () => {
    const user: User = { _id: "user_1", email: "ada@example.com" };
    const repository = {
      findById: vi.fn(async () => user),
    };
    const middleware = createGetByIdMiddleware({
      attachTo: "user",
      param: "id",
      repository,
    });
    const request = { params: { id: "user_1" } } as unknown as Request &
      Record<string, unknown>;
    const response = createResponse();
    const next = vi.fn() as NextFunction;

    await middleware(request, response, next);

    expect(repository.findById).toHaveBeenCalledWith("user_1");
    expect(request.user).toBe(user);
    expect(response.locals.user).toBe(user);
    expect(next).toHaveBeenCalledWith();
  });

  it("passes typed not-found errors to next by default", async () => {
    const repository = {
      findById: vi.fn(async () => null),
    };
    const middleware = createGetByIdMiddleware<User>({
      attachTo: "user",
      collectionName: "users",
      param: "id",
      repository,
    });
    const request = { params: { id: "missing" } } as unknown as Request;
    const response = createResponse();
    const next = vi.fn() as NextFunction;

    await middleware(request, response, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ name: "TypedMongoNotFoundError" }),
    );
    expect(response.status).not.toHaveBeenCalled();
  });

  it("can send a 404 response for missing documents", async () => {
    const repository = {
      findById: vi.fn(async () => null),
    };
    const middleware = createGetByIdMiddleware<User>({
      attachTo: "user",
      notFound: "response",
      param: "id",
      repository,
    });
    const request = { params: { id: "missing" } } as unknown as Request;
    const response = createResponse();
    const next = vi.fn() as NextFunction;

    await middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Not Found", statusCode: 404 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes repository errors to next", async () => {
    const error = new Error("database offline");
    const repository = {
      findById: vi.fn(async () => {
        throw error;
      }),
    };
    const middleware = createGetByIdMiddleware<User>({
      attachTo: "user",
      param: "id",
      repository,
    });
    const request = { params: { id: "user_1" } } as unknown as Request;
    const response = createResponse();
    const next = vi.fn() as NextFunction;

    await middleware(request, response, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
