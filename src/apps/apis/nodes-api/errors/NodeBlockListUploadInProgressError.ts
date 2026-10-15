import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class NodeBlockListUploadInProgressError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429060,
      'Another node block list upload is in progress. Retry when it finishes.',
    );
  }
}
