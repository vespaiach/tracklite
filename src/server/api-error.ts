type ApiErrorStatus = 401 | 403 | 404 | 409 | 410 | 422 | 429 | 503;

export class ApiError extends Error {
  readonly status: ApiErrorStatus;
  readonly fields?: Record<string, string>;

  constructor(status: ApiErrorStatus, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}