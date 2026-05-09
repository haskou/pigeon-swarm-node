import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

export class InvalidSignedRequestError extends CustomHttpError {
  constructor() {
    super(401, 401020, 'Invalid signed request.');
  }
}
