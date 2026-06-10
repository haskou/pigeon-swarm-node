import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { PushSubscriptionRegisterMessage } from '@app/contexts/push-notifications/application/register/messages/PushSubscriptionRegisterMessage';
import { PushSubscriptionRegistrar } from '@app/contexts/push-notifications/application/register/PushSubscriptionRegistrar';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PushSubscriptionBody } from '../bodies/PushSubscriptionBody';
import { PushSubscriptionViewModel } from '../view-model/PushSubscriptionViewModel';

@JsonController('/push')
export class PutPushSubscriptionRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly registrar = this.get<PushSubscriptionRegistrar>(
    PushSubscriptionRegistrar,
  );

  @Put('/subscriptions')
  public async putSubscription(
    @Body() body: PushSubscriptionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const subscription = await this.registrar.register(
      new PushSubscriptionRegisterMessage(
        identityId.valueOf(),
        body.endpoint,
        body.keys.p256dh,
        body.keys.auth,
        body.expirationTime,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PushSubscriptionViewModel(subscription).toResource());
  }
}
