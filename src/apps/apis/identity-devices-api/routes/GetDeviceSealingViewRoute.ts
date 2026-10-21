import DeviceSealingViewFinder from '@app/contexts/identity-devices/application/find/DeviceSealingViewFinder';
import { DeviceSealingViewFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceSealingViewFindMessage';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

import DeviceSealingViewRateLimiter from '../DeviceSealingViewRateLimiter';
import { DeviceSealingViewNotFoundError } from '../errors/DeviceSealingViewNotFoundError';
import { DeviceSealingViewViewModel } from '../view-model/DeviceSealingViewViewModel';

@JsonController('/identity-devices')
export class GetDeviceSealingViewRoute extends Route {
  private readonly finder = this.get<DeviceSealingViewFinder>(
    DeviceSealingViewFinder,
  );

  private readonly rateLimiter = this.get<DeviceSealingViewRateLimiter>(
    DeviceSealingViewRateLimiter,
  );

  /** Public: a sender needs it before it holds any credential of the node. */
  @Get('/:identityId/sealing-view')
  public async find(
    @Param('identityId') identityId: string,
    @Res() response: Response,
  ): Promise<Response> {
    const target = new IdentityId(decodeURIComponent(identityId));
    this.rateLimiter.consume(target);

    try {
      const view = await this.finder.find(
        new DeviceSealingViewFindMessage(target),
      );

      return response
        .status(HttpRouteStatusEnum.OK)
        .send(new DeviceSealingViewViewModel(target, view).toResource());
    } catch (error) {
      if (error instanceof DeviceAuthorizationNotFoundError) {
        throw new DeviceSealingViewNotFoundError();
      }

      throw error;
    }
  }
}
