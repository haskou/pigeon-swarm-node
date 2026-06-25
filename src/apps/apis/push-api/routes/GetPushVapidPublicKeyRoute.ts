import PushVapidPublicKeyFinder from '@app/contexts/push-notifications/application/find-vapid-public-key/PushVapidPublicKeyFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
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
