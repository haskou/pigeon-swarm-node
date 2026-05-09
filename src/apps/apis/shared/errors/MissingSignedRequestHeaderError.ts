import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

export class MissingSignedRequestHeaderError extends CustomHttpError {
  constructor(header: string) {
    super(401, 401021, `Missing signed request header '${header}'.`);
  }
}
