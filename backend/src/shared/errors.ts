export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad Request", code?: string, details?: unknown) {
    super(message, 400, code || "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", code?: string) {
    super(message, 401, code || "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden", code?: string) {
    super(message, 403, code || "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found", code?: string) {
    super(message, 404, code || "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Conflict occurred", code?: string) {
    super(message, 409, code || "CONFLICT");
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Validation failed", details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(fromState: string, toState: string, reason?: string) {
    const msg = `Invalid state transition from '${fromState}' to '${toState}'${
      reason ? `: ${reason}` : ""
    }`;
    super(msg, 409, "INVALID_STATE_TRANSITION");
  }
}

export class SecurityError extends AppError {
  constructor(message: string = "Security violation detected", code?: string) {
    super(message, 400, code || "SECURITY_VIOLATION");
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = "Database operation failed", details?: unknown) {
    super(message, 500, "DATABASE_ERROR", details);
  }
}
