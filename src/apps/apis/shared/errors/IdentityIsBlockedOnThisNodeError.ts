import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

export class IdentityIsBlockedOnThisNodeError extends CustomHttpError {
  constructor() {
    super(403, 403012, 'Identity is blocked on this node.');
  }
}
