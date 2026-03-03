import type { ApiError } from '@second-brain/types';

export class ApiHttpError extends Error {
  status: number;
  body: ApiError;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.body = { code, message, details };
  }
}
