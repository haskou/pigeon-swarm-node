import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { PushNotificationTestMessage } from '@app/contexts/push-notifications/application/test/messages/PushNotificationTestMessage';
import PushTestNotificationSender from '@app/contexts/push-notifications/application/test/PushTestNotificationSender';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPushTestBody } from '../bodies/PostPushTestBody';
import { PushTestViewModel } from '../view-model/PushTestViewModel';

@JsonController('/push')
export class PostPushTestRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly testNotificationSender =
    this.get<PushTestNotificationSender>(PushTestNotificationSender);

  @Post('/test')
  public async testPush(
    @Body() body: PostPushTestBody | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const results = await this.testNotificationSender.send(
      new PushNotificationTestMessage(identityId.valueOf(), body?.endpoint),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PushTestViewModel(results).toResource());
  }
}
