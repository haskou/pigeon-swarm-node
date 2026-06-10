import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';

export default class ReplicatedStateNotReadyError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.SERVICE_UNAVAILABLE,
      503020,
      'Replicated state is not ready yet. Retry after the node finishes opening and synchronizing its stores.',
    );
  }
}
