import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class RealtimeTicketCapacityExceededError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429050,
      'Too many realtime tickets are outstanding. Retry after they expire.',
    );
  }
}
