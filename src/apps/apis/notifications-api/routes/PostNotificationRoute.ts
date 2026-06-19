import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { NotificationCreateMessage } from '@app/contexts/notifications/application/create/messages/NotificationCreateMessage';
import NotificationCreator from '@app/contexts/notifications/application/create/NotificationCreator';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostNotificationBody } from '../bodies/PostNotificationBody';
import { AuthenticatedIdentityIsNotInviterError } from '../errors/AuthenticatedIdentityIsNotInviterError';
import { PostNotificationRequest } from '../requests/PostNotificationRequest';
import { NotificationViewModel } from '../view-model/NotificationViewModel';

@JsonController('/notifications')
export class PostNotificationRoute extends Route {
  private readonly creator: NotificationCreator =
    this.get<NotificationCreator>(NotificationCreator);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private assertRequesterIsInviter(
    message: NotificationCreateMessage,
    request: Request,
  ): void {
    const id = this.signedRequestAuthenticator.authenticate(request);

    if (message.getInviterIdentityId().isNotEqual(id)) {
      throw new AuthenticatedIdentityIsNotInviterError();
    }
  }

  @Post('/')
  public async createNotification(
    @Body() body: PostNotificationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const message = new PostNotificationRequest(body).getMessage();

    this.assertRequesterIsInviter(message, request);

    const notification = await this.creator.create(message);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NotificationViewModel(notification).toResource());
  }
}
