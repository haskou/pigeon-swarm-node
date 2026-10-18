import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

const URI_TOO_LONG = 414;

export class SignedRequestTargetIsTooLongError extends CustomHttpError {
  constructor(maxBytes: number) {
    super(
      URI_TOO_LONG,
      414010,
      `Request target is too long. Maximum size is ${maxBytes} bytes.`,
    );
  }
}
