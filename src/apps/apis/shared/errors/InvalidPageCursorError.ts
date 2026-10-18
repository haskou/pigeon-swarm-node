import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

export class InvalidPageCursorError extends CustomHttpError {
  constructor() {
    super(400, 400110, 'The page cursor is invalid for this resource.');
  }
}
