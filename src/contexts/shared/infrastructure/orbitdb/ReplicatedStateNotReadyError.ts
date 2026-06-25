import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export default class ReplicatedStateNotReadyError extends CustomHttpError {
  public static readonly CODE = 503020;

  constructor() {
    super(
      HttpRouteStatusEnum.SERVICE_UNAVAILABLE,
      ReplicatedStateNotReadyError.CODE,
      'Replicated state is not ready yet. Retry after the node finishes opening and synchronizing replicated state.',
    );
  }
}
