import PushVapidPublicKeyFinder from '@app/contexts/push-notifications/application/find-vapid-public-key/PushVapidPublicKeyFinder';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

@JsonController('/push')
export class GetPushVapidPublicKeyRoute extends Route {
  private readonly finder = this.get<PushVapidPublicKeyFinder>(
    PushVapidPublicKeyFinder,
  );

  @Get('/vapid-public-key')
  public getPublicKey(@Res() response: Response): Response {
    return response.status(HttpRouteStatusEnum.OK).send(this.finder.find());
  }
}
