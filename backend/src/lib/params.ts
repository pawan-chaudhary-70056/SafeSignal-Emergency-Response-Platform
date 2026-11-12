import type { Request } from "express";
import { badRequest } from "./errors.js";

/** Reads a required path parameter as a single string. */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];

  if (typeof value !== "string" || value.length === 0) {
    throw badRequest("INVALID_PATH_PARAMETER", `Path parameter "${name}" is required`);
  }

  return value;
}
