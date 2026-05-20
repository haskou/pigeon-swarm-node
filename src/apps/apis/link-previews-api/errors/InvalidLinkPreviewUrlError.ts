import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';

export class InvalidLinkPreviewUrlError extends CustomHttpError {
  constructor(message: string = 'Invalid link preview URL.') {
    super(HttpRouteStatusEnum.BAD_REQUEST, 400040, message);
  }
}
