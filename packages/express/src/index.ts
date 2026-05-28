import {
  getDocumentById,
  TypedMongoError,
  TypedMongoNotFoundError,
  type TypedMongoGetByIdCapableRepository,
} from "@typed-mongo/core";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export type TypedMongoExpressAttachTarget = "both" | "locals" | "request";
export type TypedMongoExpressNotFoundMode = "next" | "response";

export type TypedMongoExpressRequest<TAttachTo extends string, TDocument> = Request &
  Record<TAttachTo, TDocument>;

export interface CreateGetByIdMiddlewareOptions<
  TDocument,
  TId = string,
  TAttachTo extends string = string,
> {
  attach?: TypedMongoExpressAttachTarget;
  attachTo: TAttachTo;
  collectionName?: string;
  mapId?: (rawId: string, request: Request) => TId | Promise<TId>;
  notFound?: TypedMongoExpressNotFoundMode;
  param: string;
  repository: TypedMongoGetByIdCapableRepository<TDocument, TId>;
  statusCode?: number;
}

export function createGetByIdMiddleware<
  TDocument,
  TId = string,
  const TAttachTo extends string = string,
>(options: CreateGetByIdMiddlewareOptions<TDocument, TId, TAttachTo>): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const rawId = readRouteParam(request.params, options.param);
      const id = options.mapId ? await options.mapId(rawId, request) : (rawId as TId);
      const document = await getDocumentById(options.repository, id, {
        collectionName: options.collectionName,
      });

      attachExpressDocument(request, response, options.attachTo, document, {
        attach: options.attach ?? "both",
      });
      next();
    } catch (error) {
      if (options.notFound === "response" && error instanceof TypedMongoNotFoundError) {
        response.status(options.statusCode ?? 404).json({
          error: "Not Found",
          message: error.message,
          statusCode: options.statusCode ?? 404,
        });
        return;
      }

      next(error);
    }
  };
}

export function attachExpressDocument<TDocument>(
  request: Request,
  response: Response,
  attachTo: string,
  document: TDocument,
  options: { attach?: TypedMongoExpressAttachTarget } = {},
): void {
  const attach = options.attach ?? "both";

  if (attach === "request" || attach === "both") {
    (request as Request & Record<string, TDocument>)[attachTo] = document;
  }

  if (attach === "locals" || attach === "both") {
    response.locals[attachTo] = document;
  }
}

function readRouteParam(params: Request["params"], param: string): string {
  const value = (params as Record<string, string | undefined>)[param];

  if (typeof value !== "string" || value.length === 0) {
    throw new TypedMongoError(`Route parameter "${param}" is required.`, {
      code: "TYPED_MONGO_ROUTE_PARAM_REQUIRED",
    });
  }

  return value;
}
