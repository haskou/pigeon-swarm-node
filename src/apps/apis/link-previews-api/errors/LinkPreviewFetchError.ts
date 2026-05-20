import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';

export class LinkPreviewFetchError extends CustomHttpError {
  constructor(message: string = 'Could not fetch link preview.') {
    super(HttpRouteStatusEnum.SERVICE_UNAVAILABLE, 503010, message);
  }
}
