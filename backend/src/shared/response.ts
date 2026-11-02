import type { Response } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code?: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  meta?: Record<string, unknown>
): Response => {
  const payload: ApiResponse<T> = {
    success: true,
    data,
    ...(message ? { message } : {}),
    ...(meta ? { meta } : {}),
  };
  return res.status(200).json(payload);
};

export const sendCreated = <T>(
  res: Response,
  data: T,
  message: string = "Resource created successfully"
): Response => {
  const payload: ApiResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(201).json(payload);
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  code?: string,
  details?: unknown
): Response => {
  const payload: ApiResponse = {
    success: false,
    message,
    error: {
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
    },
  };
  return res.status(statusCode).json(payload);
};
