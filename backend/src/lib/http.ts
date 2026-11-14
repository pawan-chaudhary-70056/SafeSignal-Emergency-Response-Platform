import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError, unauthorized } from "./errors.js";
import type { RoleCode } from "../modules/roles/role.constants.js";

export interface Actor {
  userId: string;
  role: RoleCode;
}

export const asyncHandler =
  (
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };

export function actorFrom(req: Request): Actor {
  if (!req.auth) {
    throw unauthorized();
  }
  return { userId: req.auth.userId, role: req.auth.role };
}

export function errorBody(error: AppError): object {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
