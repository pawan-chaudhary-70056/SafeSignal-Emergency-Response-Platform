export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHENTICATED", message);

export const forbidden = (message: string) => new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found") => new AppError(404, "NOT_FOUND", message);

export const conflict = (code: string, message: string) =>
  new AppError(409, code, message);
