import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NotificationsFinder from '@app/contexts/notifications/application/find/NotificationsFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetNotificationsRequest } from '../requests/GetNotificationsRequest';
import { NotificationsViewModel } from '../view-model/NotificationsViewModel';

@JsonController('/notifications')
export class GetNotificationsRoute extends Route {
  private readonly finder: NotificationsFinder =
    this.get<NotificationsFinder>(NotificationsFinder);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Get()
  public async getNotifications(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const recipientIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const pageRequest = new GetNotificationsRequest(
      recipientIdentityId,
      limit,
      cursor,
    );
    const page = await this.finder.find(pageRequest.getMessage());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NotificationsViewModel(
          page.items,
          pageRequest.nextCursor(page.nextPosition),
        ).toResource(),
      );
  }
}
