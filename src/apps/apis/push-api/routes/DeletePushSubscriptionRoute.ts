import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { PushSubscriptionRemoveMessage } from '@app/contexts/push-notifications/application/remove/messages/PushSubscriptionRemoveMessage';
import { PushSubscriptionRemover } from '@app/contexts/push-notifications/application/remove/PushSubscriptionRemover';
import { MongoPushSubscriptionRepository } from '@app/contexts/push-notifications/infrastructure/mongo/MongoPushSubscriptionRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, Delete, JsonController, Req, Res } from 'routing-controllers';

import { PushSubscriptionBody } from '../bodies/PushSubscriptionBody';

@JsonController('/push')
export class DeletePushSubscriptionRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private remover(): PushSubscriptionRemover {
    return new PushSubscriptionRemover(
      new MongoPushSubscriptionRepository(this.get<MongoDB>(MongoDB)),
    );
  }

  @Delete('/subscriptions')
  public async deleteSubscription(
    @Body() body: PushSubscriptionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);

    await this.remover().remove(
      new PushSubscriptionRemoveMessage(identityId.valueOf(), body.endpoint),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      deleted: true,
    });
  }
}
