import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class NonCanonicalIdentityIdError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.BAD_REQUEST,
      400080,
      'Identity id is not the canonical encoding of a usable key.',
    );
  }
}
