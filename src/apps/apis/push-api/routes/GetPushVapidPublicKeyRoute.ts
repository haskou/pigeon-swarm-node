import { PushVapidConfiguration } from '@app/contexts/push-notifications/infrastructure/web-push/PushVapidConfiguration';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

@JsonController('/push')
export class GetPushVapidPublicKeyRoute extends Route {
  @Get('/vapid-public-key')
  public getPublicKey(@Res() response: Response): Response {
    const configuration = new PushVapidConfiguration();

    return response.status(HttpRouteStatusEnum.OK).send({
      enabled: configuration.isConfigured(),
      publicKey: configuration.getPublicKey(),
    });
  }
}
