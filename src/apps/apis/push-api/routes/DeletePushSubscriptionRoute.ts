import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { PushSubscriptionRemoveMessage } from '@app/contexts/push-notifications/application/remove/messages/PushSubscriptionRemoveMessage';
import PushSubscriptionRemover from '@app/contexts/push-notifications/application/remove/PushSubscriptionRemover';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, Delete, JsonController, Req, Res } from 'routing-controllers';

import { PushSubscriptionBody } from '../bodies/PushSubscriptionBody';

@JsonController('/push')
export class DeletePushSubscriptionRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly remover = this.get<PushSubscriptionRemover>(
    PushSubscriptionRemover,
  );

  @Delete('/subscriptions')
  public async deleteSubscription(
    @Body() body: PushSubscriptionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);

    await this.remover.remove(
      new PushSubscriptionRemoveMessage(identityId.valueOf(), body.endpoint),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      deleted: true,
    });
  }
}
