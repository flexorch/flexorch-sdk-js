export class FlexOrchError extends Error {
  readonly statusCode: number | undefined;
  readonly errorCode: string | undefined;

  constructor(message: string, statusCode?: number, errorCode?: string) {
    super(message);
    this.name = "FlexOrchError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export class AuthError extends FlexOrchError {
  constructor(message: string, statusCode = 401, errorCode?: string) {
    super(message, statusCode, errorCode);
    this.name = "AuthError";
  }
}

export class QuotaError extends FlexOrchError {
  readonly remainingCredits: number | undefined;
  readonly resetAt: string | undefined;

  constructor(
    message: string,
    statusCode = 402,
    errorCode?: string,
    remainingCredits?: number,
    resetAt?: string,
  ) {
    super(message, statusCode, errorCode);
    this.name = "QuotaError";
    this.remainingCredits = remainingCredits;
    this.resetAt = resetAt;
  }
}

export class RateLimitError extends FlexOrchError {
  readonly retryAfter: number;

  constructor(message: string, retryAfter = 60) {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class NotFoundError extends FlexOrchError {
  constructor(message: string, errorCode?: string) {
    super(message, 404, errorCode);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends FlexOrchError {
  constructor(message: string, errorCode?: string) {
    super(message, 422, errorCode);
    this.name = "ValidationError";
  }
}

export class ServerError extends FlexOrchError {
  constructor(message: string, statusCode = 500, errorCode?: string) {
    super(message, statusCode, errorCode);
    this.name = "ServerError";
  }
}

export class JobFailedError extends FlexOrchError {
  readonly jobId: string;
  readonly failureReason: string;

  constructor(jobId: string, failureReason: string) {
    super(`Job ${jobId} failed: ${failureReason}`);
    this.name = "JobFailedError";
    this.jobId = jobId;
    this.failureReason = failureReason;
  }
}

export class JobTimeoutError extends FlexOrchError {
  readonly jobId: string;
  readonly timeout: number;

  constructor(jobId: string, timeout: number) {
    super(`Job ${jobId} did not complete within ${timeout}s`);
    this.name = "JobTimeoutError";
    this.jobId = jobId;
    this.timeout = timeout;
  }
}
