import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NotificationsFinder from '@app/contexts/notifications/application/find/NotificationsFinder';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
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

  @Get('/')
  public async getNotifications(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('beforeNotificationId')
    beforeNotificationId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const recipientIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const notifications = await this.finder.find(
      new GetNotificationsRequest(
        recipientIdentityId,
        limit,
        beforeNotificationId,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NotificationsViewModel(notifications).toResource());
  }
}
