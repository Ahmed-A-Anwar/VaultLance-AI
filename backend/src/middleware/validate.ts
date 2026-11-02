import type { Request, Response, NextFunction } from "express";
import { type ZodType, ZodError } from "zod";
import { sendError } from "../shared/response.js";

export const validate = (schema: ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      }) as { body?: any; params?: any; query?: any };

      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.params !== undefined) req.params = parsed.params;
      if (parsed.query !== undefined) req.query = parsed.query;

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return sendError(
          res,
          400,
          "Validation failed",
          "VALIDATION_ERROR",
          err.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          }))
        );
      }
      next(err);
    }
  };
};
