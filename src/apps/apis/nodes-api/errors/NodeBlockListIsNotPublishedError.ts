import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class NodeBlockListIsNotPublishedError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.NOT_FOUND,
      404040,
      'Node block list is not published.',
    );
  }
}
