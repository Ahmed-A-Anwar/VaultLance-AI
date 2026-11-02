import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors.js";
import { sendError } from "../shared/response.js";
import { logger } from "../shared/logger.js";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error("[API ERROR]", err);

  if (res.headersSent) {
    return;
  }

  if (err instanceof AppError) {
    return sendError(
      res,
      err.statusCode,
      err.message,
      err.code,
      err.details
    );
  }

  // Handle Multer upload errors
  if (err.name === "MulterError") {
    return sendError(res, 400, err.message, "FILE_UPLOAD_ERROR");
  }

  // Generic 500 error without exposing stack
  const isDev = process.env.NODE_ENV === "development";
  return sendError(
    res,
    500,
    "Internal Server Error",
    "INTERNAL_SERVER_ERROR",
    isDev ? { stack: err.stack } : undefined
  );
};
