import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

/** One code for every registration refusal, so it reveals nothing about codes. */
export class IdentityCreationIsRefusedOnThisNodeError extends CustomHttpError {
  constructor(message: string) {
    super(HttpRouteStatusEnum.FORBIDDEN, 403011, message);
  }
}
