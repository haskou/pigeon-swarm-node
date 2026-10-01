import DeviceAuthorizationTransitionApplier from '@app/contexts/identity-devices/application/apply-transition/DeviceAuthorizationTransitionApplier';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Body, JsonController, Post, Res } from 'routing-controllers';

import { PostDeviceAuthorizationTransitionBody } from '../bodies/PostDeviceAuthorizationTransitionBody';
import DeviceAuthorizationTransitionRateLimiter from '../DeviceAuthorizationTransitionRateLimiter';
import { PostDeviceAuthorizationTransitionRequest } from '../requests/PostDeviceAuthorizationTransitionRequest';
import { DeviceAuthorizationViewModel } from '../view-model/DeviceAuthorizationViewModel';

@JsonController('/identity-devices')
export class PostDeviceAuthorizationTransitionRoute extends Route {
  private readonly applier = this.get<DeviceAuthorizationTransitionApplier>(
    DeviceAuthorizationTransitionApplier,
  );

  private readonly rateLimiter =
    this.get<DeviceAuthorizationTransitionRateLimiter>(
      DeviceAuthorizationTransitionRateLimiter,
    );

  @Post('/transitions')
  public async apply(
    @Body({
      options: { limit: '32kb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PostDeviceAuthorizationTransitionBody,
    @Res() response: Response,
  ): Promise<Response> {
    const message = new PostDeviceAuthorizationTransitionRequest(
      body,
    ).getMessage();

    this.rateLimiter.consume(message.transition.getIdentityId());
    const authorization = await this.applier.apply(message);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new DeviceAuthorizationViewModel(authorization).toResource());
  }
}
