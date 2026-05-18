import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

@JsonController('/push')
export class GetPushVapidPublicKeyRoute extends Route {
  @Get('/vapid-public-key')
  public getPublicKey(@Res() response: Response): Response {
    const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY || null;

    return response.status(HttpRouteStatusEnum.OK).send({
      enabled: Boolean(publicKey),
      publicKey,
    });
  }
}
