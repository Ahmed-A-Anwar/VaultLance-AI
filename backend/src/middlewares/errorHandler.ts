
import type { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("[API ERROR]", err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};
