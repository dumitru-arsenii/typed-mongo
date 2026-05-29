import type { Repository } from "@typed-mongo/core";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

export type TypedMongoFastifyNotFoundMode = "reply" | "throw";

export type TypedMongoFastifyRequest<
  TAttachTo extends string,
  TDocument,
> = FastifyRequest & Record<TAttachTo, TDocument>;

export interface CreateGetByIdPreHandlerOptions<
  TDocument,
  TId extends Parameters<Repository<any>["findById"]>[0] = string,
  TAttachTo extends string = string,
> {
  attachTo: TAttachTo;
  collectionName?: string;
  mapId?: (rawId: string, request: FastifyRequest) => TId | Promise<TId>;
  notFound?: TypedMongoFastifyNotFoundMode;
  param: string;
  repository: Pick<Repository<TDocument & { _id?: any }>, "findById">;
  statusCode?: number;
}

export function createGetByIdPreHandler<
  TDocument,
  TId extends Parameters<Repository<any>["findById"]>[0] = string,
  const TAttachTo extends string = string,
>(
  options: CreateGetByIdPreHandlerOptions<TDocument, TId, TAttachTo>,
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rawId = readRouteParam(request.params, options.param);
      const id = options.mapId ? await options.mapId(rawId, request) : (rawId as TId);
      const document = (await options.repository.findById(id)) as TDocument | null;

      if (document === null) {
        throw new TypedMongoNotFoundError(options.collectionName, id);
      }

      (request as FastifyRequest & Record<string, TDocument>)[options.attachTo] =
        document;
    } catch (error) {
      if (options.notFound === "reply" && error instanceof TypedMongoNotFoundError) {
        await reply.code(options.statusCode ?? 404).send({
          error: "Not Found",
          message: error.message,
          statusCode: options.statusCode ?? 404,
        });
        return;
      }

      throw error;
    }
  };
}

function readRouteParam(params: unknown, param: string): string {
  const value =
    params === null || typeof params !== "object"
      ? undefined
      : (params as Record<string, string | undefined>)[param];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Route parameter "${param}" is required.`);
  }

  return value;
}

class TypedMongoNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(collectionName: string | undefined, id: unknown) {
    const subject =
      collectionName === undefined
        ? "Document"
        : `Document in collection "${collectionName}"`;

    super(`${subject} with id "${String(id)}" was not found.`);
    this.name = "TypedMongoNotFoundError";
  }
}
