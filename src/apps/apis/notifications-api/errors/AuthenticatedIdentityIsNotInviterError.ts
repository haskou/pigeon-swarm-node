import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

export class AuthenticatedIdentityIsNotInviterError extends CustomHttpError {
  constructor() {
    super(
      403,
      403020,
      'Authenticated identity is not the notification inviter.',
    );
  }
}
