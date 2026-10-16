import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

const REQUEST_TIMEOUT = 408;

export class SignedRequestBodyReadTimeoutError extends CustomHttpError {
  constructor(timeoutMs: number) {
    super(
      REQUEST_TIMEOUT,
      408010,
      `Request body was not received within ${timeoutMs} ms.`,
    );
  }
}
