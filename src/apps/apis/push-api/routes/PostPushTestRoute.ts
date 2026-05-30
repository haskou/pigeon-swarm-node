import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { PushNotificationTestMessage } from '@app/contexts/push-notifications/application/test/messages/PushNotificationTestMessage';
import { PushNotificationTester } from '@app/contexts/push-notifications/application/test/PushNotificationTester';
import { MongoPushSubscriptionRepository } from '@app/contexts/push-notifications/infrastructure/mongo/MongoPushSubscriptionRepository';
import { WebPushNotificationDelivery } from '@app/contexts/push-notifications/infrastructure/web-push/WebPushNotificationDelivery';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPushTestBody } from '../bodies/PostPushTestBody';
import { PushTestViewModel } from '../view-model/PushTestViewModel';

@JsonController('/push')
export class PostPushTestRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private tester(): PushNotificationTester {
    return new PushNotificationTester(
      new MongoPushSubscriptionRepository(this.get<MongoDB>(MongoDB)),
      new WebPushNotificationDelivery(),
    );
  }

  @Post('/test')
  public async testPush(
    @Body() body: PostPushTestBody | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const results = await this.tester().test(
      new PushNotificationTestMessage(identityId.valueOf(), body?.endpoint),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PushTestViewModel(results).toResource());
  }
}
