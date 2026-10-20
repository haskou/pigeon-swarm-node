import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export default class ReplicatedStateNotReadyError extends CustomHttpError {
  private static readonly DEFAULT_MESSAGE =
    'Replicated state is not ready yet. Retry after the node finishes opening and synchronizing replicated state.';

  public static readonly CODE = 503020;

  constructor(message = ReplicatedStateNotReadyError.DEFAULT_MESSAGE) {
    super(
      HttpRouteStatusEnum.SERVICE_UNAVAILABLE,
      ReplicatedStateNotReadyError.CODE,
      message,
    );
  }
}
