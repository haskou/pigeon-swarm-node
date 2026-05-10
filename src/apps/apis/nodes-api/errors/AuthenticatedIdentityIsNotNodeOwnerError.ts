import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

export class AuthenticatedIdentityIsNotNodeOwnerError extends CustomHttpError {
  constructor() {
    super(403, 403010, 'Authenticated identity is not the node owner.');
  }
}
